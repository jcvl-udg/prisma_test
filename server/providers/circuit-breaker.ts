import type Redis from 'ioredis';
import { ProviderCircuitOpenError, ProviderOperationError } from './types';

const FAILURE_THRESHOLD = 5;
const OPEN_SECONDS = 30;

export interface CircuitBreaker {
  execute<T>(providerCode: string, action: () => Promise<T>): Promise<T>;
}

export class RedisCircuitBreaker implements CircuitBreaker {
  constructor(private readonly redis: Redis) {}

  async execute<T>(providerCode: string, action: () => Promise<T>): Promise<T> {
    const key = `cb:${providerCode}`;
    const failures = Number(await this.redis.get(key) ?? 0);
    if (failures >= FAILURE_THRESHOLD) {
      throw new ProviderCircuitOpenError(providerCode);
    }

    try {
      const result = await action();
      await this.redis.del(key);
      return result;
    } catch (error) {
      if (error instanceof ProviderOperationError && error.retryable) {
        const count = Number(
          await this.redis.eval(
            `local failures = redis.call('INCR', KEYS[1]); if failures == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return failures`,
            1,
            key,
            OPEN_SECONDS,
          ),
        );
        if (count >= FAILURE_THRESHOLD) {
          console.error(`[providers:circuit] circuito abierto para ${providerCode}`);
        }
      }
      throw error;
    }
  }
}

export class MemoryCircuitBreaker implements CircuitBreaker {
  private readonly failures = new Map<string, { count: number; expiresAt: number }>();

  async execute<T>(providerCode: string, action: () => Promise<T>): Promise<T> {
    const state = this.failures.get(providerCode);
    if (state && state.expiresAt <= Date.now()) this.failures.delete(providerCode);
    const activeState = this.failures.get(providerCode);
    if ((activeState?.count ?? 0) >= FAILURE_THRESHOLD) {
      throw new ProviderCircuitOpenError(providerCode);
    }
    try {
      const result = await action();
      this.failures.delete(providerCode);
      return result;
    } catch (error) {
      if (error instanceof ProviderOperationError && error.retryable) {
        this.failures.set(providerCode, {
          count: (activeState?.count ?? 0) + 1,
          expiresAt: activeState?.expiresAt ?? Date.now() + OPEN_SECONDS * 1000,
        });
      }
      throw error;
    }
  }
}
