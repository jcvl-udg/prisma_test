import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { RedisProviderCache } from '../server/providers/cache';
import { closeRedisClient, getRedisClient } from '../server/providers/redis';

async function checkRedisCache(): Promise<void> {
  if (!process.env.REDIS_URL?.trim() && !process.env.VALKEY_URL?.trim()) {
    console.error('Configure REDIS_URL o VALKEY_URL en .env antes de probar Upstash.');
    process.exitCode = 1;
    return;
  }

  const redis = getRedisClient();
  const cache = new RedisProviderCache(redis);
  const key = `check:provider-cache:${randomUUID()}`;
  const expected = { status: 'ok', checkedAt: new Date().toISOString() };
  let loads = 0;

  try {
    const ping = await redis.ping();
    if (ping !== 'PONG') throw new Error('Redis ping did not return PONG');

    const first = await cache.getOrLoad(key, 30, async () => {
      loads++;
      return expected;
    });
    const cached = await cache.getOrLoad(key, 30, async () => {
      loads++;
      return { status: 'unexpected', checkedAt: '' };
    });

    if (JSON.stringify(first) !== JSON.stringify(expected)) {
      throw new Error('Redis cache returned a different value on first load');
    }
    if (JSON.stringify(cached) !== JSON.stringify(expected) || loads !== 1) {
      throw new Error('Redis cache did not return its stored value');
    }
    if (await redis.ttl(key) <= 0) throw new Error('Redis cache key has no TTL');

    console.log('Redis connection, cache hit, and TTL verified.');
  } finally {
    await redis.del(key);
    await closeRedisClient();
  }
}

checkRedisCache().catch((error: unknown) => {
  console.error(
    'Redis cache check failed:',
    error instanceof Error ? error.name : 'unknown error',
  );
  process.exitCode = 1;
});
