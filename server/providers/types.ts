import type { Prisma, PrismaClient } from '../../prisma/generated/client';

export type ProviderDatabase = PrismaClient;

export type ProviderHotel = {
  id: string;
  slug: string;
  title: string;
  destinationId: string;
  categoryStars: number;
};

export type ProviderRate = {
  roomId: string;
  hotelId: string;
  providerId: string;
  checkIn: Date;
  checkOut: Date;
  priceAmount: string;
  currency: string;
  providerRateKey: string | null;
};

export type SearchParams = {
  hotelIds?: string[];
  destinationId?: string;
  query?: string;
};

export type AvailabilityParams = {
  hotelId: string;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  childrenAges: number[];
};

export type QuoteParams = {
  hotelId: string;
  roomId: string;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  childrenAges: number[];
  userId: string | null;
  anonymousId: string | null;
};

export type BookingParams = {
  quoteId: string;
  idempotencyKey: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  userId: string | null;
};

export type CancelParams = {
  bookingId: string;
  providerBookingRef: string | null;
  reason?: string;
};

export type ProviderQuote = { id: string };
export type ProviderBooking = { id: string };

export type ProviderBookingResult = {
  providerBookingRef: string | null;
  status: 'CONFIRMED' | 'PENDING';
};

export type ProviderCancelResult = {
  cancelled: boolean;
  providerBookingRef: string | null;
};

export type ProviderHealth = {
  ok: boolean;
  latencyMs: number;
};

export interface ProviderClient {
  readonly code: string;
  readonly displayName: string;
  searchHotels(params: SearchParams): Promise<ProviderHotel[]>;
  getAvailability(params: AvailabilityParams): Promise<ProviderRate[]>;
  createQuote(params: QuoteParams): Promise<ProviderQuote>;
  createBooking(params: BookingParams): Promise<ProviderBooking>;
  cancelBooking(params: CancelParams): Promise<ProviderCancelResult>;
  healthCheck(): Promise<ProviderHealth>;
  handleWebhook?(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<void>;
}

export type ProviderOperationErrorOptions = {
  retryable?: boolean;
  cause?: unknown;
};

export class ProviderOperationError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options: ProviderOperationErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'ProviderOperationError';
    this.retryable = options.retryable ?? true;
  }
}

export class ProviderCircuitOpenError extends Error {
  constructor(providerCode: string) {
    super(`El proveedor ${providerCode} está temporalmente deshabilitado`);
    this.name = 'ProviderCircuitOpenError';
  }
}

export class ProviderRateLimitError extends Error {
  constructor() {
    super('Se alcanzó el límite de solicitudes del proveedor; intenta más tarde');
    this.name = 'ProviderRateLimitError';
  }
}

export class ProviderNotFoundError extends Error {
  constructor(providerCode: string) {
    super(`No hay un cliente registrado para el proveedor ${providerCode}`);
    this.name = 'ProviderNotFoundError';
  }
}
