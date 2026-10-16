import type Redis from 'ioredis';

export interface ProviderCache {
  getOrLoad<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T>;
}

export class RedisProviderCache implements ProviderCache {
  constructor(private readonly redis: Redis) {}

  async getOrLoad<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached !== null) return JSON.parse(cached) as T;

    const value = await load();
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return value;
  }
}

export class MemoryProviderCache implements ProviderCache {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  async getOrLoad<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return JSON.parse(cached.value) as T;
    }
    if (cached) this.entries.delete(key);

    const value = await load();
    this.entries.set(key, {
      value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return value;
  }
}
