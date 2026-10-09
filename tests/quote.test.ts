import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createYoga } from 'graphql-yoga';
import { schema } from '../server/schema';
import type { Context } from '../server/context';
import { testPrisma, disconnectTestDb } from './helpers/db';
import { createEphemeralHotel } from './helpers/fixtures';

// ─────────────────────────────────────────────────────────────
// Yoga se encarga de TODO el pipeline GraphQL (parse, validate, execute)
// usando su propia instancia de `graphql`. Esto evita el problema de
// "duplicate realm" que aparece al llamar `graphql()` directo sobre un
// schema construido por Pothos bajo vitest.
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
      hotelId
      roomId
      checkIn
      checkOut
      adults
      childrenAges
      priceAmount
      currency
      expiresAt
    }
  }
`;

const toIso = (d: Date) => d.toISOString().slice(0, 10);

describe('createQuote', () => {
  let fx: Awaited<ReturnType<typeof createEphemeralHotel>>;

  beforeEach(async () => {
    fx = await createEphemeralHotel({ nights: 3, price: '100.00' });
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('calcula priceAmount como la suma de todas las noches', async () => {
    try {
      const result: any = await gql(CREATE_QUOTE, {
        hotelId: fx.hotelId,
        roomId: fx.roomId,
        checkIn: toIso(fx.checkIn),
        checkOut: toIso(fx.checkOut),
        adults: 2,
        childrenAges: [],
      });

      expect(result.errors).toBeUndefined();
      expect(result.data.createQuote.priceAmount).toBe('300');
      expect(result.data.createQuote.currency).toBe('USD');
    } finally {
      await fx.cleanup();
    }
  });

  it('rechaza cuando una noche no tiene disponibilidad', async () => {
    try {
      const middle = new Date(fx.checkIn.getTime() + 86_400_000);
      await testPrisma.roomInventory.update({
        where: { roomId_date: { roomId: fx.roomId, date: middle } },
        data: { available: 0 },
      });

      const result: any = await gql(CREATE_QUOTE, {
        hotelId: fx.hotelId,
        roomId: fx.roomId,
        checkIn: toIso(fx.checkIn),
        checkOut: toIso(fx.checkOut),
        adults: 2,
        childrenAges: [],
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toMatch(/Sin disponibilidad/);
    } finally {
      await fx.cleanup();
    }
  });

  it('rechaza cuando checkOut es igual o anterior a checkIn', async () => {
    try {
      const result: any = await gql(CREATE_QUOTE, {
        hotelId: fx.hotelId,
        roomId: fx.roomId,
        checkIn: toIso(fx.checkOut),
        checkOut: toIso(fx.checkIn),
        adults: 2,
        childrenAges: [],
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toMatch(/posterior/i);
    } finally {
      await fx.cleanup();
    }
  });

  it('rechaza cuando adults excede maxAdults de la habitación', async () => {
    try {
      const result: any = await gql(CREATE_QUOTE, {
        hotelId: fx.hotelId,
        roomId: fx.roomId,
        checkIn: toIso(fx.checkIn),
        checkOut: toIso(fx.checkOut),
        adults: 5,
        childrenAges: [],
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toMatch(/máximo 2 adultos/i);
    } finally {
      await fx.cleanup();
    }
  });
});