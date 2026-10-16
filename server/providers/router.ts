import type { PrismaClient } from '../../prisma/generated/client';
import { RedisProviderCache } from './cache';
import type { ProviderCache } from './cache';
import { getProviderExecutionPolicy } from './execution-policy';
import type { ProviderExecutionPolicy } from './execution-policy';
import { LocalProviderClient } from './local/LocalProviderClient';
import { getRedisClient } from './redis';
import { ProviderRegistry } from './registry';
import type {
  AvailabilityParams,
  BookingParams,
  CancelParams,
  ProviderBooking,
  ProviderClient,
  ProviderDatabase,
  ProviderHealth,
  ProviderHotel,
  ProviderRate,
  QuoteParams,
  SearchParams,
} from './types';

const AVAILABILITY_CACHE_TTL_SECONDS = 5 * 60;
const RATE_CACHE_TTL_SECONDS = 60 * 60;

type SerializedRate = Omit<ProviderRate, 'checkIn' | 'checkOut'> & {
  checkIn: string;
  checkOut: string;
};

export class ProviderRouter {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly policy: ProviderExecutionPolicy,
    private readonly cache?: ProviderCache,
  ) {}

  get(providerCode: string): ProviderClient {
    return this.registry.get(this.normalizeProviderCode(providerCode));
  }

  list(): ProviderClient[] {
    return this.registry.list();
  }

  searchHotels(providerCode: string, params: SearchParams): Promise<ProviderHotel[]> {
    const code = this.normalizeProviderCode(providerCode);
    const provider = this.get(code);
    return this.policy.run(
      code,
      'searchHotels',
      () => provider.searchHotels(params),
    );
  }

  async getAvailability(
    providerCode: string,
    params: AvailabilityParams,
  ): Promise<ProviderRate[]> {
    const code = this.normalizeProviderCode(providerCode);
    const provider = this.get(code);
    const loader = () =>
      this.policy.run(code, 'getAvailability', () => provider.getAvailability(params));
    if (code === 'LOCAL' || !this.cache) return loader();

    const key = [
      `availability:${code}:${params.hotelId}`,
      params.checkIn.toISOString().slice(0, 10),
      params.checkOut.toISOString().slice(0, 10),
      params.adults,
      params.childrenAges.join(','),
    ].join(':');
    const serialized = await this.cache.getOrLoad<SerializedRate[]>(
      key,
      AVAILABILITY_CACHE_TTL_SECONDS,
      async () =>
        (await loader()).map((rate) => ({
          ...rate,
          checkIn: rate.checkIn.toISOString(),
          checkOut: rate.checkOut.toISOString(),
        })),
    );
    return serialized.map((rate) => ({
      ...rate,
      checkIn: new Date(rate.checkIn),
      checkOut: new Date(rate.checkOut),
    }));
  }

  async getRate(
    providerCode: string,
    rateKey: string,
    load: () => Promise<ProviderRate>,
  ): Promise<ProviderRate> {
    const code = this.normalizeProviderCode(providerCode);
    const loader = () => this.policy.run(code, 'getRate', load);
    if (code === 'LOCAL' || !this.cache) return loader();
    const serialized = await this.cache.getOrLoad<SerializedRate>(
      `rate:${code}:${rateKey}`,
      RATE_CACHE_TTL_SECONDS,
      async () => {
        const rate = await loader();
        return {
          ...rate,
          checkIn: rate.checkIn.toISOString(),
          checkOut: rate.checkOut.toISOString(),
        };
      },
    );
    return {
      ...serialized,
      checkIn: new Date(serialized.checkIn),
      checkOut: new Date(serialized.checkOut),
    };
  }

  async createQuote(
    providerCode: string,
    params: QuoteParams,
  ): Promise<{ id: string }> {
    const code = this.normalizeProviderCode(providerCode);
    return this.policy.run(
      code,
      'createQuote',
      () => this.get(code).createQuote(params),
      params.userId ?? params.anonymousId,
    );
  }

  async createBooking(
    providerCode: string,
    params: BookingParams,
  ): Promise<{ id: string }> {
    const code = this.normalizeProviderCode(providerCode);
    return this.policy.run(
      code,
      'createBooking',
      () => this.get(code).createBooking(params),
    );
  }

  cancelBooking(providerCode: string, params: CancelParams) {
    const code = this.normalizeProviderCode(providerCode);
    return this.policy.run(
      code,
      'cancelBooking',
      () => this.get(code).cancelBooking(params),
    );
  }

  healthCheck(providerCode: string): Promise<ProviderHealth> {
    return this.get(this.normalizeProviderCode(providerCode)).healthCheck();
  }

  private normalizeProviderCode(providerCode: string): string {
    return providerCode.trim().toUpperCase();
  }
}

export function createProviderRouter(
  prisma: ProviderDatabase,
  options: {
    policy?: ProviderExecutionPolicy;
    cache?: ProviderCache;
    providers?: ProviderClient[];
  } = {},
): ProviderRouter {
  return new ProviderRouter(
    createProviderRegistry(prisma, options.providers),
    options.policy ?? getProviderExecutionPolicy(),
    options.cache,
  );
}

export function createProviderRegistry(
  prisma: ProviderDatabase,
  providers?: ProviderClient[],
): ProviderRegistry {
  const registry = new ProviderRegistry();
  const clients = providers ?? [new LocalProviderClient(prisma)];
  for (const client of clients) registry.register(client);
  return registry;
}

export async function providerCodeFor(
  prisma: PrismaClient,
  providerId: string,
): Promise<string> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { code: true, isActive: true },
  });
  if (!provider) throw new Error(`No se encontró el proveedor ${providerId}`);
  if (!provider.isActive) throw new Error(`El proveedor ${provider.code} está desactivado`);
  return provider.code;
}

export function createRuntimeProviderRouter(prisma: ProviderDatabase): ProviderRouter {
  const cache = process.env.NODE_ENV === 'test'
    ? undefined
    : new RedisProviderCache(getRedisClient());
  return createProviderRouter(prisma, { cache });
}
