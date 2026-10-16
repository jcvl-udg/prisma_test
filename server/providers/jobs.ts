import { createHash } from 'node:crypto';
import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import type Redis from 'ioredis';
import { getRedisClient } from './redis';

export const PROVIDER_QUEUE_NAME = 'provider-jobs';

export type ProviderJobName =
  | 'provider.book'
  | 'provider.cancel'
  | 'provider.syncCatalog'
  | 'provider.refreshPriceFrom';

export type ProviderJobPayload = {
  'provider.book': {
    providerCode: string;
    bookingId: string;
    idempotencyKey: string;
  };
  'provider.cancel': {
    providerCode: string;
    bookingId: string;
    reason?: string;
    idempotencyKey: string;
  };
  'provider.syncCatalog': {
    providerCode: string;
    idempotencyKey: string;
  };
  'provider.refreshPriceFrom': {
    providerCode: string;
    hotelId: string;
    roomId?: string;
    idempotencyKey: string;
  };
};

export type ProviderJobHandlers = {
  [Name in ProviderJobName]: (payload: ProviderJobPayload[Name]) => Promise<void>;
};

const RETRY_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: 86_400 },
  removeOnFail: { age: 604_800 },
};

function jobId(name: ProviderJobName, providerCode: string, idempotencyKey: string): string {
  const digest = createHash('sha256')
    .update(providerCode.toUpperCase())
    .update('\0')
    .update(idempotencyKey)
    .digest('hex');
  return `${name.replaceAll('.', '-')}-${digest}`;
}

export async function enqueueProviderJob<Name extends ProviderJobName>(
  name: Name,
  payload: ProviderJobPayload[Name],
  queue?: Queue<ProviderJobPayload[ProviderJobName], void, ProviderJobName>,
) {
  if (queue) {
    return queue.add(name, payload, {
      ...RETRY_OPTIONS,
      jobId: jobId(name, payload.providerCode, payload.idempotencyKey),
    });
  }
  const defaultQueue = createProviderQueue();
  try {
    return await defaultQueue.add(name, payload, {
      ...RETRY_OPTIONS,
      jobId: jobId(name, payload.providerCode, payload.idempotencyKey),
    });
  } finally {
    await defaultQueue.close();
  }
}

export function createProviderQueue(
  connection: ConnectionOptions | Redis = getRedisClient(),
  queueName = PROVIDER_QUEUE_NAME,
): Queue<ProviderJobPayload[ProviderJobName], void, ProviderJobName> {
  return new Queue<ProviderJobPayload[ProviderJobName], void, ProviderJobName>(
    queueName,
    { connection },
  );
}

export { jobId as providerJobId };
