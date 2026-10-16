import { randomUUID } from 'node:crypto';
import type { Job, Worker } from 'bullmq';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { RedisProviderCache } from '../server/providers/cache';
import { RedisCircuitBreaker } from '../server/providers/circuit-breaker';
import {
  createProviderQueue,
  enqueueProviderJob,
  providerJobId,
  type ProviderJobName,
  type ProviderJobPayload,
} from '../server/providers/jobs';
import { RedisProviderRateLimiter } from '../server/providers/rate-limiter';
import { closeRedisClient, getRedisClient } from '../server/providers/redis';
import {
  ProviderCircuitOpenError,
  ProviderOperationError,
  ProviderRateLimitError,
} from '../server/providers/types';
import { createProviderWorker } from '../server/providers/worker';

function waitForJobCompletion(
  worker: Worker<ProviderJobPayload[ProviderJobName], void, ProviderJobName>,
  jobId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeout: NodeJS.Timeout;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      worker.off('completed', onCompleted);
      worker.off('failed', onFailed);
      if (error) reject(error);
      else resolve();
    };
    const onCompleted = (job: Job<ProviderJobPayload[ProviderJobName], void, ProviderJobName>) => {
      if (job.id === jobId) finish();
    };
    const onFailed = (
      job: Job<ProviderJobPayload[ProviderJobName], void, ProviderJobName> | undefined,
      error: Error,
    ) => {
      if (job?.id === jobId && job.attemptsMade >= (job.opts.attempts ?? 1)) finish(error);
    };
    timeout = setTimeout(() => finish(new Error('Timed out waiting for BullMQ job')), 12_000);
    worker.on('completed', onCompleted);
    worker.on('failed', onFailed);
  });
}

const hasRedisConnection = Boolean(
  process.env.REDIS_URL?.trim() || process.env.VALKEY_URL?.trim(),
);

describe.skipIf(!hasRedisConnection)('Upstash/Redis provider cache integration', () => {
  afterAll(async () => {
    await closeRedisClient();
  });

  it('connects, caches a value, honors TTL and cleans up its isolated test key', async () => {
    const redis = getRedisClient();
    const cache = new RedisProviderCache(redis);
    const key = `test:provider-cache:${randomUUID()}`;
    const expected = { amount: '245.50', currency: 'USD' };
    let loads = 0;

    try {
      await expect(redis.ping()).resolves.toBe('PONG');
      await expect(cache.getOrLoad(key, 30, async () => {
        loads++;
        return expected;
      })).resolves.toEqual(expected);
      await expect(cache.getOrLoad(key, 30, async () => {
        loads++;
        return { amount: '0', currency: 'XXX' };
      })).resolves.toEqual(expected);

      expect(loads).toBe(1);
      expect(await redis.ttl(key)).toBeGreaterThan(0);
    } finally {
      await redis.del(key);
    }
  });

  it('runs the Redis circuit-breaker script and distributed rate limits', async () => {
    const redis = getRedisClient();
    const providerCode = `test-${randomUUID()}`;
    const quoteIdentity = `test-${randomUUID()}`;
    const circuitKey = `cb:${providerCode}`;
    const providerRateKey = `provider-rate:${providerCode}`;
    const quoteRateKey = `quote-user-rate:${quoteIdentity}`;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const breaker = new RedisCircuitBreaker(redis);
      const fail = () => Promise.reject(new ProviderOperationError('test failure'));
      for (let index = 0; index < 5; index++) {
        await expect(breaker.execute(providerCode, fail)).rejects.toThrow('test failure');
      }
      await expect(breaker.execute(providerCode, async () => 'unexpected'))
        .rejects.toBeInstanceOf(ProviderCircuitOpenError);

      const limiter = new RedisProviderRateLimiter(redis);
      await Promise.all(
        Array.from({ length: 10 }, () => limiter.consumeProvider(providerCode)),
      );
      for (let index = 0; index < 10; index++) await limiter.consumeQuote(quoteIdentity);
      await expect(limiter.consumeProvider(providerCode))
        .rejects.toBeInstanceOf(ProviderRateLimitError);
      await expect(limiter.consumeQuote(quoteIdentity))
        .rejects.toBeInstanceOf(ProviderRateLimitError);
    } finally {
      log.mockRestore();
      await redis.del(circuitKey, providerRateKey, quoteRateKey);
    }
  });

  it('enqueues, deduplicates, retries and processes jobs through BullMQ', async () => {
    const redis = getRedisClient();
    const queueName = `test-provider-${randomUUID()}`;
    const queue = createProviderQueue(redis, queueName);
    let bookCalls = 0;
    let catalogCalls = 0;
    const handlers = {
      'provider.book': async () => {
        bookCalls++;
      },
      'provider.cancel': async () => {},
      'provider.syncCatalog': async () => {
        catalogCalls++;
        if (catalogCalls === 1) throw new Error('temporary sync failure');
      },
      'provider.refreshPriceFrom': async () => {},
    };
    const worker = createProviderWorker(handlers, redis, queueName);
    const testIdempotencyKey = `booking-${randomUUID()}`;
    const retryIdempotencyKey = `catalog-${randomUUID()}`;
    const bookingJobId = providerJobId('provider.book', 'TEST', testIdempotencyKey);
    const retryJobId = providerJobId(
      'provider.syncCatalog',
      'TEST',
      retryIdempotencyKey,
    );
    let bookingCompletion: Promise<void> | undefined;
    let retryCompletion: Promise<void> | undefined;

    try {
      await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);

      bookingCompletion = waitForJobCompletion(worker, bookingJobId);
      const bookingPayload = {
        providerCode: 'TEST',
        bookingId: `booking-${randomUUID()}`,
        idempotencyKey: testIdempotencyKey,
      };
      const bookingJob = await enqueueProviderJob('provider.book', bookingPayload, queue);
      const duplicateBookingJob = await enqueueProviderJob('provider.book', bookingPayload, queue);

      expect(bookingJob.id).toBe(bookingJobId);
      expect(duplicateBookingJob.id).toBe(bookingJobId);
      expect(bookingJob.opts.attempts).toBe(5);
      expect(bookingJob.opts.backoff).toEqual({ type: 'exponential', delay: 1_000 });
      await bookingCompletion;
      expect(bookCalls).toBe(1);

      retryCompletion = waitForJobCompletion(worker, retryJobId);
      await enqueueProviderJob('provider.syncCatalog', {
        providerCode: 'TEST',
        idempotencyKey: retryIdempotencyKey,
      }, queue);
      await retryCompletion;
      expect(catalogCalls).toBe(2);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await Promise.allSettled([bookingCompletion, retryCompletion].filter(
        (promise): promise is Promise<void> => promise !== undefined,
      ));
    }
  }, 30_000);
});
