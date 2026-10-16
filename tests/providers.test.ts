import { describe, expect, it, vi } from 'vitest';
import { MemoryProviderCache } from '../server/providers/cache';
import { MemoryCircuitBreaker } from '../server/providers/circuit-breaker';
import { providerJobId } from '../server/providers/jobs';
import { ProviderRegistry } from '../server/providers/registry';
import { MemoryProviderRateLimiter } from '../server/providers/rate-limiter';
import {
  ProviderCircuitOpenError,
  ProviderOperationError,
  ProviderRateLimitError,
  type ProviderClient,
} from '../server/providers/types';
import { isValidWebhookSignature } from '../server/providers/webhook';
import { dispatchProviderJob } from '../server/providers/worker';
import { createHmac } from 'node:crypto';

const client = (code: string): ProviderClient => ({
  code,
  displayName: code,
  searchHotels: async () => [],
  getAvailability: async () => [],
  createQuote: async () => ({ id: 'quote' }),
  createBooking: async () => ({ id: 'booking' }),
  cancelBooking: async () => ({ cancelled: true, providerBookingRef: null }),
  healthCheck: async () => ({ ok: true, latencyMs: 0 }),
});

describe('provider infrastructure', () => {
  it('opens the circuit after five retryable failures and resets it on success', async () => {
    const breaker = new MemoryCircuitBreaker();
    const fail = () => Promise.reject(new ProviderOperationError('falló'));
    for (let index = 0; index < 5; index++) {
      await expect(breaker.execute('HOTEL', fail)).rejects.toThrow('falló');
    }
    await expect(breaker.execute('HOTEL', async () => 'ok'))
      .rejects.toBeInstanceOf(ProviderCircuitOpenError);

    const resetBreaker = new MemoryCircuitBreaker();
    await expect(resetBreaker.execute('HOTEL', fail)).rejects.toThrow('falló');
    await expect(resetBreaker.execute('HOTEL', async () => 'ok')).resolves.toBe('ok');
    await expect(resetBreaker.execute('HOTEL', async () => 'ok')).resolves.toBe('ok');
  });

  it('expires an open in-memory circuit after thirty seconds', async () => {
    vi.useFakeTimers();
    try {
      const breaker = new MemoryCircuitBreaker();
      const fail = () => Promise.reject(new ProviderOperationError('falló'));
      for (let index = 0; index < 5; index++) {
        await expect(breaker.execute('HOTEL', fail)).rejects.toThrow('falló');
      }
      vi.advanceTimersByTime(30_001);
      await expect(breaker.execute('HOTEL', async () => 'ok')).resolves.toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });

  it('enforces provider and per-user quote limits', async () => {
    const limiter = new MemoryProviderRateLimiter();
    for (let index = 0; index < 10; index++) await limiter.consumeProvider('LOCAL');
    await expect(limiter.consumeProvider('LOCAL')).rejects.toBeInstanceOf(ProviderRateLimitError);

    for (let index = 0; index < 10; index++) await limiter.consumeQuote('user-1');
    await expect(limiter.consumeQuote('user-1')).rejects.toBeInstanceOf(ProviderRateLimitError);
    await expect(limiter.consumeQuote('user-2')).resolves.toBeUndefined();
  });

  it('caches loaded values until their TTL expires', async () => {
    const cache = new MemoryProviderCache();
    let loads = 0;
    const load = async () => ++loads;

    await expect(cache.getOrLoad('rate:1', 1, load)).resolves.toBe(1);
    await expect(cache.getOrLoad('rate:1', 1, load)).resolves.toBe(1);
    expect(loads).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 1_010));
    await expect(cache.getOrLoad('rate:1', 1, load)).resolves.toBe(2);
    expect(loads).toBe(2);
  });

  it('normalizes provider codes and rejects duplicate registration', () => {
    const registry = new ProviderRegistry();
    registry.register(client('local'));
    expect(registry.get('LOCAL').code).toBe('local');
    expect(() => registry.register(client('LOCAL'))).toThrow('Provider duplicado');
  });

  it('creates deterministic, non-sensitive queue job IDs', () => {
    const first = providerJobId('provider.book', 'LOCAL', 'booking-key');
    expect(providerJobId('provider.book', 'local', 'booking-key')).toBe(first);
    expect(first).not.toContain('booking-key');
    expect(providerJobId('provider.book', 'HOTEL', 'booking-key')).not.toBe(first);
    expect(providerJobId('provider.cancel', 'LOCAL', 'booking-key')).not.toBe(first);
  });

  it('dispatches validated payloads to the matching provider job handler', async () => {
    const received: string[] = [];
    const handlers = {
      'provider.book': async ({ bookingId }: { bookingId: string }) => {
        received.push(`book:${bookingId}`);
      },
      'provider.cancel': async ({ bookingId }: { bookingId: string }) => {
        received.push(`cancel:${bookingId}`);
      },
      'provider.syncCatalog': async ({ providerCode }: { providerCode: string }) => {
        received.push(`sync:${providerCode}`);
      },
      'provider.refreshPriceFrom': async ({ hotelId }: { hotelId: string }) => {
        received.push(`price:${hotelId}`);
      },
    };

    await dispatchProviderJob('provider.book', {
      providerCode: 'HOTEL',
      bookingId: 'b-1',
      idempotencyKey: 'key-1',
    }, handlers);
    await dispatchProviderJob('provider.cancel', {
      providerCode: 'HOTEL',
      bookingId: 'b-2',
      idempotencyKey: 'key-2',
    }, handlers);
    await dispatchProviderJob('provider.syncCatalog', {
      providerCode: 'HOTEL',
      idempotencyKey: 'key-3',
    }, handlers);
    await dispatchProviderJob('provider.refreshPriceFrom', {
      providerCode: 'HOTEL',
      hotelId: 'h-1',
      idempotencyKey: 'key-4',
    }, handlers);

    expect(received).toEqual(['book:b-1', 'cancel:b-2', 'sync:HOTEL', 'price:h-1']);
    await expect(dispatchProviderJob('provider.book', {}, handlers))
      .rejects.toThrow('Payload inválido para provider.book');
  });

  it('validates webhook HMAC signatures against the raw body', () => {
    const body = Buffer.from('{"event":"booking.updated"}');
    const secret = 'test-secret';
    const digest = createHmac('sha256', secret).update(body).digest('hex');

    expect(isValidWebhookSignature(body, `sha256=${digest}`, secret)).toBe(true);
    expect(isValidWebhookSignature(body, `sha256=${digest}`, 'wrong-secret')).toBe(false);
    expect(isValidWebhookSignature(body, 'invalid', secret)).toBe(false);
    expect(isValidWebhookSignature(Buffer.from('tampered'), `sha256=${digest}`, secret)).toBe(false);
  });
});
