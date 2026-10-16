import { Worker, type ConnectionOptions } from 'bullmq';
import type Redis from 'ioredis';
import { getRedisClient } from './redis';
import {
  PROVIDER_QUEUE_NAME,
  type ProviderJobHandlers,
  type ProviderJobName,
  type ProviderJobPayload,
} from './jobs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasBaseFields(value: unknown): value is Record<string, unknown> & {
  providerCode: string;
  idempotencyKey: string;
} {
  return isRecord(value)
    && typeof value.providerCode === 'string'
    && typeof value.idempotencyKey === 'string';
}

export async function dispatchProviderJob(
  name: ProviderJobName,
  payload: unknown,
  handlers: ProviderJobHandlers,
): Promise<void> {
  switch (name) {
    case 'provider.book':
      if (!hasBaseFields(payload) || typeof payload.bookingId !== 'string') {
        throw new Error('Payload inválido para provider.book');
      }
      return handlers['provider.book'](payload as ProviderJobPayload['provider.book']);
    case 'provider.cancel':
      if (
        !hasBaseFields(payload)
        || typeof payload.bookingId !== 'string'
        || (payload.reason !== undefined && typeof payload.reason !== 'string')
      ) {
        throw new Error('Payload inválido para provider.cancel');
      }
      return handlers['provider.cancel'](payload as ProviderJobPayload['provider.cancel']);
    case 'provider.syncCatalog':
      if (!hasBaseFields(payload)) {
        throw new Error('Payload inválido para provider.syncCatalog');
      }
      return handlers['provider.syncCatalog'](
        payload as ProviderJobPayload['provider.syncCatalog'],
      );
    case 'provider.refreshPriceFrom':
      if (!hasBaseFields(payload) || typeof payload.hotelId !== 'string') {
        throw new Error('Payload inválido para provider.refreshPriceFrom');
      }
      if (payload.roomId !== undefined && typeof payload.roomId !== 'string') {
        throw new Error('Payload inválido para provider.refreshPriceFrom');
      }
      return handlers['provider.refreshPriceFrom'](
        payload as ProviderJobPayload['provider.refreshPriceFrom'],
      );
  }
}

export function createProviderWorker(
  handlers: ProviderJobHandlers,
  connection: ConnectionOptions | Redis = getRedisClient(),
  queueName = PROVIDER_QUEUE_NAME,
): Worker<ProviderJobPayload[ProviderJobName], void, ProviderJobName> {
  return new Worker<ProviderJobPayload[ProviderJobName], void, ProviderJobName>(
    queueName,
    (job) => dispatchProviderJob(job.name, job.data, handlers),
    { connection },
  );
}
