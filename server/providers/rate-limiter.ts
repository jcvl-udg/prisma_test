import type Redis from 'ioredis';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { ProviderRateLimitError } from './types';

type RateLimiter = {
  consume(key: string): Promise<unknown>;
};

export interface ProviderRateLimiter {
  consumeProvider(providerCode: string): Promise<void>;
  consumeQuote(userId: string): Promise<void>;
}

async function consume(limiter: RateLimiter, key: string): Promise<void> {
  try {
    await limiter.consume(key);
  } catch (error) {
    if (error instanceof RateLimiterRes) throw new ProviderRateLimitError();
    throw error;
  }
}

export class RedisProviderRateLimiter implements ProviderRateLimiter {
  private readonly providerLimiter: RateLimiterRedis;
  private readonly quoteLimiter: RateLimiterRedis;

  constructor(redis: Redis) {
    this.providerLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'provider-rate',
      points: 10,
      duration: 1,
      blockDuration: 1,
    });
    this.quoteLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'quote-user-rate',
      points: 10,
      duration: 60,
      blockDuration: 60,
    });
  }

  async consumeProvider(providerCode: string): Promise<void> {
    await consume(this.providerLimiter, providerCode);
  }

  async consumeQuote(userId: string): Promise<void> {
    await consume(this.quoteLimiter, userId);
  }
}

export class MemoryProviderRateLimiter implements ProviderRateLimiter {
  private readonly providerLimiter = new RateLimiterMemory({
    keyPrefix: 'provider-rate',
    points: 10,
    duration: 1,
    blockDuration: 1,
  });
  private readonly quoteLimiter = new RateLimiterMemory({
    keyPrefix: 'quote-user-rate',
    points: 10,
    duration: 60,
    blockDuration: 60,
  });

  async consumeProvider(providerCode: string): Promise<void> {
    await consume(this.providerLimiter, providerCode);
  }

  async consumeQuote(userId: string): Promise<void> {
    await consume(this.quoteLimiter, userId);
  }
}
