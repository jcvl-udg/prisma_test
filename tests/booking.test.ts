import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createYoga } from 'graphql-yoga';
import { schema } from '../server/schema';
import type { Context } from '../server/context';
import { testPrisma, disconnectTestDb } from './helpers/db';
import { createEphemeralHotel } from './helpers/fixtures';

// ─────────────────────────────────────────────────────────────
// Yoga en modo test — maskedErrors:false para ver los mensajes reales
// ─────────────────────────────────────────────────────────────
const yoga = createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  logging: false,
  maskedErrors: false,
  context: () =>
    ({
      prisma: testPrisma,
      user: null,
      anonymousId: null,
    }) as unknown as Context,
});

async function gql(query: string, variables: Record<string, unknown> = {}) {
  const res = await yoga.fetch('http://test/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const CREATE_QUOTE = /* GraphQL */ `
  mutation CreateQuote(
    $hotelId: String!
    $roomId: String!
    $checkIn: Date!
    $checkOut: Date!
    $adults: Int!
    $childrenAges: [Int!]!
  ) {
    createQuote(
      hotelId: $hotelId
      roomId: $roomId
      checkIn: $checkIn
      checkOut: $checkOut
      adults: $adults
      childrenAges: $childrenAges
    ) {
      id
    }
  }
`;

const CREATE_BOOKING = /* GraphQL */ `
  mutation CreateBooking(
    $quoteId: String!
    $idempotencyKey: String!
    $guestName: String!
    $guestEmail: String!
    $guestPhone: String
  ) {
    createBooking(
      quoteId: $quoteId
      idempotencyKey: $idempotencyKey
      guestName: $guestName
      guestEmail: $guestEmail
      guestPhone: $guestPhone
    ) {
      id
      reference
      status
      totalAmount
      currency
      items {
        id
        checkIn
        checkOut
        priceAmount
      }
    }
  }
`;

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const rid = () => crypto.randomUUID();

describe('createBooking', () => {
  let fx: Awaited<ReturnType<typeof createEphemeralHotel>>;

  beforeEach(async () => {
    fx = await createEphemeralHotel({ nights: 3, price: '100.00' });
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  async function createQuoteForFx(): Promise<string> {
    const res: any = await gql(CREATE_QUOTE, {
      hotelId: fx.hotelId,
      roomId: fx.roomId,
      checkIn: toIso(fx.checkIn),
      checkOut: toIso(fx.checkOut),
      adults: 2,
      childrenAges: [],
    });
    if (res.errors) throw new Error('Quote setup falló: ' + res.errors[0].message);
    return res.data.createQuote.id as string;
  }

  it('crea la reserva con snapshot, evento CREATED y email normalizado', async () => {
    try {
      const quoteId = await createQuoteForFx();
      const result: any = await gql(CREATE_BOOKING, {
        quoteId,
        idempotencyKey: rid(),
        guestName: 'Ana Test',
        guestEmail: 'Ana@Example.COM',
        guestPhone: null,
      });

      expect(result.errors).toBeUndefined();
      const b = result.data.createBooking;

      expect(b.reference).toMatch(/^AG-[A-Z2-9]{6}$/);
      expect(b.status).toBe('PENDING');
      expect(b.totalAmount).toBe('300');
      expect(b.currency).toBe('USD');
      expect(b.items).toHaveLength(1);
      expect(b.items[0].priceAmount).toBe('300');

      const row = await testPrisma.booking.findUniqueOrThrow({ where: { id: b.id } });
      expect(row.guestEmail).toBe('ana@example.com');

      const events = await testPrisma.bookingEvent.findMany({
        where: { bookingId: b.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(events.map((e) => e.type)).toEqual(['CREATED']);
    } finally {
      await fx.cleanup();
    }
  });

  it('es idempotente: mismo idempotencyKey => una sola reserva y un solo decremento', async () => {
    try {
      const quoteId = await createQuoteForFx();
      const key = rid();

      const before = await testPrisma.roomInventory.findMany({
        where: { roomId: fx.roomId },
        orderBy: { date: 'asc' },
      });
      const beforeAvail = before.map((r) => r.available);

      const r1: any = await gql(CREATE_BOOKING, {
        quoteId, idempotencyKey: key,
        guestName: 'Ana', guestEmail: 'ana@example.com', guestPhone: null,
      });
      const r2: any = await gql(CREATE_BOOKING, {
        quoteId, idempotencyKey: key,
        guestName: 'Ana', guestEmail: 'ana@example.com', guestPhone: null,
      });

      expect(r1.errors).toBeUndefined();
      expect(r2.errors).toBeUndefined();
      expect(r1.data.createBooking.id).toBe(r2.data.createBooking.id);
      expect(r1.data.createBooking.reference).toBe(r2.data.createBooking.reference);

      const count = await testPrisma.booking.count({ where: { idempotencyKey: key } });
      expect(count).toBe(1);

      const after = await testPrisma.roomInventory.findMany({
        where: { roomId: fx.roomId },
        orderBy: { date: 'asc' },
      });
      after.forEach((row, i) => {
        expect(row.available).toBe(beforeAvail[i] - 1);
      });
    } finally {
      await fx.cleanup();
    }
  });

  it('rechaza cuando la cotización expiró', async () => {
    try {
      const quoteId = await createQuoteForFx();
      await testPrisma.quote.update({
        where: { id: quoteId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const result: any = await gql(CREATE_BOOKING, {
        quoteId, idempotencyKey: rid(),
        guestName: 'Ana', guestEmail: 'ana@example.com', guestPhone: null,
      });

      expect(result.errors).toBeDefined();
      expect(result.errors[0].message).toMatch(/expiró/i);

      const items = await testPrisma.bookingItem.findMany({
        where: { roomId: fx.roomId },
      });
      expect(items).toHaveLength(0);
    } finally {
      await fx.cleanup();
    }
  });

  it('descuenta inventario exactamente 1 por noche', async () => {
    try {
      const before = await testPrisma.roomInventory.findMany({
        where: { roomId: fx.roomId },
        orderBy: { date: 'asc' },
      });
      expect(before).toHaveLength(3);
      const beforeAvail = before.map((r) => r.available);

      const quoteId = await createQuoteForFx();
      const result: any = await gql(CREATE_BOOKING, {
        quoteId, idempotencyKey: rid(),
        guestName: 'Ana', guestEmail: 'ana@example.com', guestPhone: null,
      });
      expect(result.errors).toBeUndefined();

      const after = await testPrisma.roomInventory.findMany({
        where: { roomId: fx.roomId },
        orderBy: { date: 'asc' },
      });
      expect(after).toHaveLength(3);
      after.forEach((row, i) => {
        expect(row.available).toBe(beforeAvail[i] - 1);
      });
    } finally {
      await fx.cleanup();
    }
  });
});