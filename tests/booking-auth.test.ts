import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import type { Context, SessionUser } from '../server/context';
import { schema } from '../server/schema';
import { testPrisma, disconnectTestDb } from './helpers/db';
import { createEphemeralHotel } from './helpers/fixtures';

let currentUser: SessionUser | null = null;

const yoga = createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  logging: false,
  maskedErrors: false,
  context: () =>
    ({
      prisma: testPrisma,
      user: currentUser,
      anonymousId: null,
    }) as unknown as Context,
});

type GraphQLErrorResult = {
  message: string;
  extensions?: { code?: string };
};

async function gql<TData>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data?: TData; errors?: GraphQLErrorResult[] }> {
  const response = await yoga.fetch('http://test/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return response.json() as Promise<{ data?: TData; errors?: GraphQLErrorResult[] }>;
}

const BOOKING_FIELDS = `
  id
  reference
  status
  totalAmount
  currency
  createdAt
`;

const MY_BOOKINGS = /* GraphQL */ `
  query MyBookings($first: Int, $skip: Int) {
    myBookings(first: $first, skip: $skip) { ${BOOKING_FIELDS} }
  }
`;

const ADMIN_BOOKINGS = /* GraphQL */ `
  query AdminBookings($first: Int, $after: String) {
    adminBookings(first: $first, after: $after) {
      edges { node { ${BOOKING_FIELDS} } }
    }
  }
`;

describe('autorización de reservas', () => {
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('filtra mis reservas por el ID de ctx.user, sin aceptar un userId cliente', async () => {
    const [owner, other] = await Promise.all([
      testPrisma.user.create({
        data: { email: `owner.${randomUUID()}@example.test`, role: 'CUSTOMER' },
      }),
      testPrisma.user.create({
        data: { email: `other.${randomUUID()}@example.test`, role: 'CUSTOMER' },
      }),
    ]);
    const ownerBooking = await testPrisma.booking.create({
      data: {
        userId: owner.id,
        reference: `AG-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
        guestName: 'Owner',
        guestEmail: owner.email,
        status: 'CONFIRMED',
        totalAmount: '125.00',
        currency: 'USD',
        idempotencyKey: randomUUID(),
        createdAt: new Date('2099-01-01T00:00:00Z'),
      },
    });
    const otherBooking = await testPrisma.booking.create({
      data: {
        userId: other.id,
        reference: `AG-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
        guestName: 'Other',
        guestEmail: other.email,
        status: 'CONFIRMED',
        totalAmount: '225.00',
        currency: 'USD',
        idempotencyKey: randomUUID(),
        createdAt: new Date('2099-01-02T00:00:00Z'),
      },
    });

    try {
      currentUser = { id: owner.id, role: 'CUSTOMER' };
      const result = await gql<{
        myBookings: Array<{ id: string; reference: string }>;
      }>(MY_BOOKINGS, { first: 50, skip: 0, userId: other.id });

      expect(result.errors).toBeUndefined();
      expect(result.data?.myBookings.map(({ id }) => id)).toEqual([ownerBooking.id]);
      expect(result.data?.myBookings.map(({ reference }) => reference)).not.toContain(
        otherBooking.reference,
      );
    } finally {
      currentUser = null;
      await testPrisma.booking.deleteMany({
        where: { id: { in: [ownerBooking.id, otherBooking.id] } },
      });
      await testPrisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    }
  });

  it('rechaza adminBookings a CUSTOMER y admite AGENT/ADMIN', async () => {
    const customer = await testPrisma.user.create({
      data: { email: `customer.${randomUUID()}@example.test`, role: 'CUSTOMER' },
    });
    const staff = await testPrisma.user.create({
      data: { email: `agent.${randomUUID()}@example.test`, role: 'AGENT' },
    });
    const staffBooking = await testPrisma.booking.create({
      data: {
        userId: staff.id,
        reference: `AG-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
        guestName: 'Agent test',
        guestEmail: staff.email,
        status: 'CONFIRMED',
        totalAmount: '55.00',
        currency: 'USD',
        idempotencyKey: randomUUID(),
        createdAt: new Date('2099-02-01T00:00:00Z'),
      },
    });

    try {
      currentUser = { id: customer.id, role: 'CUSTOMER' };
      const forbidden = await gql(ADMIN_BOOKINGS, { first: 1 });
      expect(forbidden.errors?.[0].extensions?.code).toBe('FORBIDDEN');

      currentUser = { id: staff.id, role: 'AGENT' };
      const permitted = await gql<{
        adminBookings: { edges: Array<{ node: unknown }> };
      }>(ADMIN_BOOKINGS, {
        first: 1,
      });
      expect(permitted.errors).toBeUndefined();
      expect(permitted.data?.adminBookings.edges).toHaveLength(1);
    } finally {
      currentUser = null;
      await testPrisma.booking.delete({ where: { id: staffBooking.id } });
      await testPrisma.user.deleteMany({ where: { id: { in: [customer.id, staff.id] } } });
    }
  });

  it('vincula la cotización y la reserva al usuario autenticado', async () => {
    const fixture = await createEphemeralHotel({ nights: 2, price: '80.00' });
    const user = await testPrisma.user.create({
      data: { email: `booking-owner.${randomUUID()}@example.test`, role: 'CUSTOMER' },
    });
    let quoteId: string | undefined;
    let bookingId: string | undefined;

    try {
      currentUser = { id: user.id, role: 'CUSTOMER' };
      const quote = await gql<{ createQuote: { id: string } }>(/* GraphQL */ `
        mutation CreateQuote($hotelId: String!, $roomId: String!, $checkIn: Date!, $checkOut: Date!) {
          createQuote(
            hotelId: $hotelId
            roomId: $roomId
            checkIn: $checkIn
            checkOut: $checkOut
            adults: 2
            childrenAges: []
          ) { id }
        }
      `, {
        hotelId: fixture.hotelId,
        roomId: fixture.roomId,
        checkIn: fixture.checkIn.toISOString().slice(0, 10),
        checkOut: fixture.checkOut.toISOString().slice(0, 10),
      });
      expect(quote.errors).toBeUndefined();
      quoteId = quote.data!.createQuote.id;
      fixture.track.quote(quoteId);
      expect(
        (await testPrisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).userId,
      ).toBe(user.id);

      const booking = await gql<{ createBooking: { id: string } }>(/* GraphQL */ `
        mutation CreateBooking($quoteId: String!, $idempotencyKey: String!) {
          createBooking(
            quoteId: $quoteId
            idempotencyKey: $idempotencyKey
            guestName: "Authenticated customer"
            guestEmail: "guest@example.test"
          ) { id }
        }
      `, { quoteId, idempotencyKey: randomUUID() });
      expect(booking.errors).toBeUndefined();
      bookingId = booking.data!.createBooking.id;
      fixture.track.booking(bookingId);
      expect(
        (await testPrisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).userId,
      ).toBe(user.id);
    } finally {
      currentUser = null;
      await fixture.cleanup();
      await testPrisma.user.delete({ where: { id: user.id } });
    }
  });
});
