import { GraphQLError } from 'graphql';
import { Prisma } from '../../../prisma/generated/client';
import { ProviderOperationError } from '../types';
import type {
  AvailabilityParams,
  BookingParams,
  CancelParams,
  ProviderBooking,
  ProviderClient,
  ProviderCancelResult,
  ProviderDatabase,
  ProviderHealth,
  ProviderHotel,
  ProviderQuote,
  ProviderRate,
  QuoteParams,
  SearchParams,
} from '../types';

const MAX_STAY_NIGHTS = 30;
const BOOKING_TTL_MS = 15 * 60_000;
const QUOTE_TTL_MS = 30 * 60_000;
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function badInput(message: string): never {
  throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

function stayNights(checkIn: Date, checkOut: Date): number {
  if (checkOut <= checkIn) badInput('La fecha de salida debe ser posterior a la de entrada');
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
  if (nights > MAX_STAY_NIGHTS) {
    badInput(`La estancia máxima es de ${MAX_STAY_NIGHTS} noches`);
  }
  return nights;
}

function eachNightUTC(checkIn: Date, checkOut: Date): Date[] {
  const nights: Date[] = [];
  for (let date = new Date(checkIn); date < checkOut; date = new Date(date.getTime() + 86_400_000)) {
    nights.push(new Date(date));
  }
  return nights;
}

function generateBookingReference(): string {
  let reference = 'AG-';
  for (let index = 0; index < 6; index++) {
    reference += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return reference;
}

function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isBookingReferenceConflict(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target : [target];
  return fields.some((field) => typeof field === 'string' && field.includes('reference'));
}

export class LocalProviderClient implements ProviderClient {
  readonly code = 'LOCAL';
  readonly displayName = 'Inventario local';

  constructor(private readonly prisma: ProviderDatabase) {}

  async searchHotels(params: SearchParams): Promise<ProviderHotel[]> {
    const hotels = await this.prisma.hotel.findMany({
      where: {
        status: 'ACTIVE',
        ...(params.hotelIds?.length ? { id: { in: params.hotelIds } } : {}),
        ...(params.destinationId ? { destinationId: params.destinationId } : {}),
        ...(params.query
          ? { searchKey: { contains: params.query.trim().toLowerCase() } }
          : {}),
      },
      select: {
        id: true,
        slug: true,
        title: true,
        destinationId: true,
        categoryStars: true,
      },
      orderBy: [{ popularityScore: 'desc' }, { id: 'asc' }],
    });
    return hotels;
  }

  async getAvailability(params: AvailabilityParams): Promise<ProviderRate[]> {
    const nights = stayNights(params.checkIn, params.checkOut);
    if (params.adults < 1 || params.childrenAges.some((age) => age < 0 || age > 17)) {
      badInput('La ocupación solicitada no es válida');
    }
    const inventory = await this.prisma.roomInventory.findMany({
      where: {
        room: {
          hotelId: params.hotelId,
          maxAdults: { gte: params.adults },
          maxChildren: { gte: params.childrenAges.length },
          mappings: { some: { provider: { code: this.code } } },
        },
        date: { gte: params.checkIn, lt: params.checkOut },
        available: { gt: 0 },
      },
      include: {
        room: { select: { id: true, hotelId: true, mappings: { select: { providerId: true } } } },
      },
      orderBy: [{ roomId: 'asc' }, { date: 'asc' }],
    });

    const byRoom = new Map<string, typeof inventory>();
    for (const row of inventory) {
      const rows = byRoom.get(row.roomId) ?? [];
      rows.push(row);
      byRoom.set(row.roomId, rows);
    }

    const rates: ProviderRate[] = [];
    for (const [roomId, rows] of byRoom) {
      if (rows.length !== nights) continue;
      const mapping = rows[0].room.mappings[0];
      if (!mapping) continue;
      const price = rows.reduce(
        (total, row) => total.add(row.priceAmount),
        new Prisma.Decimal(0),
      );
      rates.push({
        roomId,
        hotelId: params.hotelId,
        providerId: mapping.providerId,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        priceAmount: price.toString(),
        currency: rows[0].currency,
        providerRateKey: null,
      });
    }
    return rates;
  }

  async createQuote(params: QuoteParams): Promise<ProviderQuote> {
    const nights = stayNights(params.checkIn, params.checkOut);
    if (params.adults < 1) badInput('Se requiere al menos 1 adulto');
    if (params.childrenAges.some((age) => age < 0 || age > 17)) {
      badInput('La edad de los niños debe estar entre 0 y 17 años');
    }

    const room = await this.prisma.room.findUniqueOrThrow({
      where: { id: params.roomId },
      include: {
        mappings: { where: { provider: { code: this.code } }, take: 1 },
      },
    });
    if (room.hotelId !== params.hotelId) badInput('La habitación no pertenece al hotel indicado');
    if (params.adults > room.maxAdults) {
      badInput(`Esta habitación admite máximo ${room.maxAdults} adultos`);
    }
    if (params.childrenAges.length > room.maxChildren) {
      badInput(`Esta habitación admite máximo ${room.maxChildren} niños`);
    }
    const mapping = room.mappings[0];
    if (!mapping) badInput('La habitación no tiene proveedor asociado');

    const rates = await this.getAvailability({
      hotelId: params.hotelId,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      adults: params.adults,
      childrenAges: params.childrenAges,
    });
    const rate = rates.find((candidate) => candidate.roomId === params.roomId);
    if (!rate) {
      const inventoryCount = await this.prisma.roomInventory.count({
        where: {
          roomId: params.roomId,
          date: { gte: params.checkIn, lt: params.checkOut },
          available: { gt: 0 },
        },
      });
      badInput(`Sin disponibilidad en todas las noches solicitadas (${inventoryCount}/${nights})`);
    }

    return this.prisma.quote.create({
      data: {
        userId: params.userId,
        anonymousId: params.userId ? null : params.anonymousId,
        hotelId: params.hotelId,
        roomId: params.roomId,
        providerId: mapping.providerId,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        adults: params.adults,
        childrenAges: params.childrenAges,
        priceAmount: new Prisma.Decimal(rate.priceAmount),
        currency: rate.currency,
        providerRateKey: rate.providerRateKey,
        expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
      },
      select: { id: true },
    });
  }

  async createBooking(params: BookingParams): Promise<ProviderBooking> {
    const existing = await this.prisma.booking.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
      select: { id: true },
    });
    if (existing) return existing;

    const quote = await this.prisma.quote.findUniqueOrThrow({
      where: { id: params.quoteId },
    });
    if (quote.expiresAt <= new Date()) {
      badInput('La cotización expiró, vuelve a buscar disponibilidad');
    }
    const nights = eachNightUTC(quote.checkIn, quote.checkOut);

    let bookingId: string | undefined;
    for (let attempt = 0; attempt < 5 && !bookingId; attempt++) {
      try {
        bookingId = await this.prisma.$transaction(async (tx) => {
          const duplicate = await tx.booking.findUnique({
            where: { idempotencyKey: params.idempotencyKey },
            select: { id: true },
          });
          if (duplicate) return duplicate.id;

          const created = await tx.booking.create({
            data: {
              reference: generateBookingReference(),
              userId: params.userId ?? quote.userId,
              guestName: params.guestName,
              guestEmail: params.guestEmail.toLowerCase().trim(),
              guestPhone: params.guestPhone,
              status: 'PENDING',
              totalAmount: quote.priceAmount,
              currency: quote.currency,
              idempotencyKey: params.idempotencyKey,
              expiresAt: new Date(Date.now() + BOOKING_TTL_MS),
              items: {
                create: {
                  hotelId: quote.hotelId,
                  roomId: quote.roomId,
                  providerId: quote.providerId,
                  checkIn: quote.checkIn,
                  checkOut: quote.checkOut,
                  adults: quote.adults,
                  childrenAges: quote.childrenAges,
                  priceAmount: quote.priceAmount,
                  currency: quote.currency,
                  status: 'PENDING',
                  providerRateKey: quote.providerRateKey,
                },
              },
              events: {
                create: {
                  type: 'CREATED',
                  payload: { quoteId: quote.id },
                },
              },
            },
            select: { id: true },
          });

          for (const date of nights) {
            const inventory = await tx.roomInventory.update({
              where: { roomId_date: { roomId: quote.roomId, date } },
              data: { available: { decrement: 1 } },
            });
            if (inventory.available < 0) {
              badInput('Inventario insuficiente, la reserva no se pudo crear');
            }
          }
          return created.id;
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;

        const idempotentBooking = await this.prisma.booking.findUnique({
          where: { idempotencyKey: params.idempotencyKey },
          select: { id: true },
        });
        if (idempotentBooking) {
          bookingId = idempotentBooking.id;
        } else if (!isBookingReferenceConflict(error)) {
          throw error;
        }
      }
    }
    if (!bookingId) badInput('No se pudo generar una referencia única, reintenta');

    return this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { id: true },
    });
  }

  async cancelBooking(params: CancelParams): Promise<ProviderCancelResult> {
    throw new ProviderOperationError(
      `La cancelación de reservas locales debe ejecutarse mediante el flujo administrativo (${params.bookingId})`,
      { retryable: false },
    );
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startedAt = performance.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      return { ok: false, latencyMs: Math.round(performance.now() - startedAt) };
    }
  }
}
