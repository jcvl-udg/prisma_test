import type Redis from 'ioredis';
import { MemoryCircuitBreaker, RedisCircuitBreaker } from './circuit-breaker';
import type { CircuitBreaker } from './circuit-breaker';
import { MemoryProviderRateLimiter, RedisProviderRateLimiter } from './rate-limiter';
import type { ProviderRateLimiter } from './rate-limiter';
import { getRedisClient } from './redis';

export interface ProviderExecutionPolicy {
  run<T>(
    providerCode: string,
    operation: string,
    action: () => Promise<T>,
    quoteIdentity?: string | null,
  ): Promise<T>;
}

export class GuardedProviderExecutionPolicy implements ProviderExecutionPolicy {
  constructor(
    private readonly circuitBreaker: CircuitBreaker,
    private readonly rateLimiter: ProviderRateLimiter,
  ) {}

  async run<T>(
    providerCode: string,
    operation: string,
    action: () => Promise<T>,
    quoteIdentity?: string | null,
  ): Promise<T> {
    await this.rateLimiter.consumeProvider(providerCode);
    if (operation === 'createQuote' && quoteIdentity) {
      await this.rateLimiter.consumeQuote(quoteIdentity);
    }
    return this.circuitBreaker.execute(providerCode, action);
  }
}

export class MemoryProviderExecutionPolicy extends GuardedProviderExecutionPolicy {
  constructor() {
    super(new MemoryCircuitBreaker(), new MemoryProviderRateLimiter());
  }
}

let executionPolicy: ProviderExecutionPolicy | undefined;

export function getProviderExecutionPolicy(): ProviderExecutionPolicy {
  if (executionPolicy) return executionPolicy;
  if (process.env.NODE_ENV === 'test') {
    executionPolicy = new MemoryProviderExecutionPolicy();
    return executionPolicy;
  }
  const redis: Redis = getRedisClient();
  executionPolicy = new GuardedProviderExecutionPolicy(
    new RedisCircuitBreaker(redis),
    new RedisProviderRateLimiter(redis),
  );
  return executionPolicy;
}

export function createRedisProviderExecutionPolicy(redis: Redis): ProviderExecutionPolicy {
  return new GuardedProviderExecutionPolicy(
    new RedisCircuitBreaker(redis),
    new RedisProviderRateLimiter(redis),
  );
}
