import Redis from 'ioredis';

let redisClient: Redis | undefined;

export function getRedisClient(): Redis {
  if (redisClient) return redisClient;
  const connectionString = process.env.REDIS_URL?.trim() || process.env.VALKEY_URL?.trim();
  if (!connectionString) {
    throw new Error('Configura REDIS_URL o VALKEY_URL para habilitar servicios de providers');
  }
  redisClient = new Redis(connectionString, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  redisClient.on('error', (error) => {
    console.error('[providers:redis] conexión Redis fallida', error.message);
  });
  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (!redisClient) return;
  const client = redisClient;
  redisClient = undefined;
  await client.quit();
}
