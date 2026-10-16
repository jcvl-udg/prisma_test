import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { schema } from '../server/schema';
import type { Context, SessionUser } from '../server/context';
import { createEphemeralHotel } from './helpers/fixtures';
import { disconnectTestDb, testPrisma } from './helpers/db';

let currentUser: SessionUser | null = { id: 'test-agent', role: 'AGENT' };

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

type GqlError = { message: string; extensions?: { code?: string } };

async function gql<TData>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data?: TData; errors?: GqlError[] }> {
  const response = await yoga.fetch('http://test/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return response.json() as Promise<{ data?: TData; errors?: GqlError[] }>;
}

const BOOKING_CONNECTION = /* GraphQL */ `
  query AdminBookings(
    $first: Int
    $last: Int
    $after: String
    $before: String
    $status: AdminBookingStatus
    $fromDate: Date
    $toDate: Date
    $guestEmail: String
    $providerCode: String
    $sort: AdminBookingSort
  ) {
    adminBookings(
      first: $first
      last: $last
      after: $after
      before: $before
      status: $status
      fromDate: $fromDate
      toDate: $toDate
      guestEmail: $guestEmail
      providerCode: $providerCode
      sort: $sort
    ) {
      edges {
        cursor
        node { id reference }
      }
      pageInfo {
        endCursor
        hasNextPage
        hasPreviousPage
      }
    }
  }
`;

const ADMIN_BOOKING_DETAIL = /* GraphQL */ `
  query AdminBookingById($id: String!) {
    adminBookingById(id: $id) {
      id
      guestEmail
      items { hotel { title } }
      events { type createdAt payload }
    }
  }
`;

const TRANSITION_ADMIN_BOOKING = /* GraphQL */ `
  mutation TransitionAdminBooking(
    $id: String!
    $transition: AdminBookingTransition!
    $reason: String
  ) {
    transitionAdminBooking(
      id: $id
      transition: $transition
      reason: $reason
    ) {
      id
      status
      confirmedAt
      cancelledAt
      items { status }
      events { type payload }
    }
  }
`;

async function createBooking(
  options: {
    email: string;
    status?: 'PENDING' | 'CONFIRMED';
    createdAt: Date;
    providerFixture?: Awaited<ReturnType<typeof createEphemeralHotel>>;
  },
) {
  return testPrisma.booking.create({
    data: {
      reference: `AG-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
      guestName: 'Admin filter fixture',
      guestEmail: options.email,
      status: options.status ?? 'CONFIRMED',
      totalAmount: '120.00',
      currency: 'USD',
      idempotencyKey: randomUUID(),
      createdAt: options.createdAt,
      ...(options.providerFixture
        ? {
            items: {
              create: {
                hotelId: options.providerFixture.hotelId,
                roomId: options.providerFixture.roomId,
                providerId: options.providerFixture.providerId,
                checkIn: options.providerFixture.checkIn,
                checkOut: options.providerFixture.checkOut,
                adults: 2,
                childrenAges: [],
                priceAmount: '120.00',
                currency: 'USD',
              },
            },
          }
        : {}),
    },
  });
}

describe('adminBookings connection', () => {
  afterAll(async () => {
    currentUser = null;
    await disconnectTestDb();
  });

  it('filters by status, inclusive creation dates, guest email, and provider', async () => {
    const fixture = await createEphemeralHotel({ nights: 1, price: '120.00' });
    const createdBookings = [];

    try {
      const matching = await createBooking({
        email: 'ada@example.test',
        status: 'CONFIRMED',
        createdAt: new Date('2099-05-10T12:00:00.000Z'),
        providerFixture: fixture,
      });
      createdBookings.push(matching.id);

      const wrongStatus = await createBooking({
        email: 'ada+pending@example.test',
        status: 'PENDING',
        createdAt: new Date('2099-05-10T13:00:00.000Z'),
        providerFixture: fixture,
      });
      createdBookings.push(wrongStatus.id);

      const wrongProvider = await createBooking({
        email: 'ada+no-provider@example.test',
        status: 'CONFIRMED',
        createdAt: new Date('2099-05-10T14:00:00.000Z'),
      });
      createdBookings.push(wrongProvider.id);

      const result = await gql<{
        adminBookings: { edges: Array<{ node: { id: string } }> };
      }>(BOOKING_CONNECTION, {
        first: 10,
        status: 'CONFIRMED',
        fromDate: '2099-05-10',
        toDate: '2099-05-10',
        guestEmail: 'ADA@',
        providerCode: 'local',
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.adminBookings.edges.map(({ node }) => node.id)).toEqual([
        matching.id,
      ]);
    } finally {
      await testPrisma.booking.deleteMany({ where: { id: { in: createdBookings } } });
      await fixture.cleanup();
    }
  });

  it('uses a stable cursor to return the next non-overlapping page', async () => {
    const createdBookings = [];

    try {
      for (let day = 1; day <= 3; day++) {
        const booking = await createBooking({
          email: `cursor-${day}@example.test`,
          createdAt: new Date(`2099-06-0${day}T12:00:00.000Z`),
        });
        createdBookings.push(booking.id);
      }

      const firstPage = await gql<{
        adminBookings: {
          edges: Array<{ cursor: string; node: { id: string } }>;
          pageInfo: { endCursor: string; hasNextPage: boolean };
        };
      }>(BOOKING_CONNECTION, {
        first: 2,
        sort: 'CREATED_ASC',
        guestEmail: 'cursor-',
      });

      expect(firstPage.errors).toBeUndefined();
      expect(firstPage.data?.adminBookings.edges.map(({ node }) => node.id)).toEqual(
        createdBookings.slice(0, 2),
      );
      expect(firstPage.data?.adminBookings.pageInfo.hasNextPage).toBe(true);

      const secondPage = await gql<{
        adminBookings: {
          edges: Array<{ cursor: string; node: { id: string } }>;
          pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean };
        };
      }>(BOOKING_CONNECTION, {
        first: 2,
        after: firstPage.data!.adminBookings.pageInfo.endCursor,
        sort: 'CREATED_ASC',
        guestEmail: 'cursor-',
      });

      expect(secondPage.errors).toBeUndefined();
      expect(secondPage.data?.adminBookings.edges.map(({ node }) => node.id)).toEqual([
        createdBookings[2],
      ]);
      expect(secondPage.data?.adminBookings.pageInfo).toMatchObject({
        hasNextPage: false,
        hasPreviousPage: true,
      });

      const previousPage = await gql<{
        adminBookings: {
          edges: Array<{ node: { id: string } }>;
          pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean };
        };
      }>(BOOKING_CONNECTION, {
        last: 2,
        before: secondPage.data!.adminBookings.edges[0].cursor,
        sort: 'CREATED_ASC',
        guestEmail: 'cursor-',
      });

      expect(previousPage.errors).toBeUndefined();
      expect(previousPage.data?.adminBookings.edges.map(({ node }) => node.id)).toEqual(
        createdBookings.slice(0, 2),
      );
      expect(previousPage.data?.adminBookings.pageInfo).toMatchObject({
        hasNextPage: true,
        hasPreviousPage: false,
      });
    } finally {
      await testPrisma.booking.deleteMany({ where: { id: { in: createdBookings } } });
    }
  });

  it('rejects a reversed creation date range as bad input', async () => {
    const result = await gql(BOOKING_CONNECTION, {
      fromDate: '2099-06-20',
      toDate: '2099-06-01',
    });

    expect(result.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('protects booking details by role and returns items and chronological events', async () => {
    const fixture = await createEphemeralHotel({ nights: 1, price: '120.00' });
    let bookingId: string | undefined;

    try {
      const booking = await createBooking({
        email: 'detail@example.test',
        createdAt: new Date('2099-07-01T12:00:00.000Z'),
        providerFixture: fixture,
      });
      bookingId = booking.id;

      await testPrisma.bookingEvent.createMany({
        data: [
          {
            bookingId: booking.id,
            type: 'CONFIRMED',
            payload: { step: 2 },
            createdAt: new Date('2099-07-01T12:02:00.000Z'),
          },
          {
            bookingId: booking.id,
            type: 'CREATED',
            payload: { step: 1 },
            createdAt: new Date('2099-07-01T12:01:00.000Z'),
          },
        ],
      });

      currentUser = { id: 'test-customer', role: 'CUSTOMER' };
      const forbidden = await gql(ADMIN_BOOKING_DETAIL, { id: booking.id });
      expect(forbidden.errors?.[0].extensions?.code).toBe('FORBIDDEN');

      currentUser = { id: 'test-agent', role: 'AGENT' };
      const result = await gql<{
        adminBookingById: {
          guestEmail: string;
          items: Array<{ hotel: { title: string } }>;
          events: Array<{ type: string; payload: string | null }>;
        } | null;
      }>(ADMIN_BOOKING_DETAIL, { id: booking.id });

      expect(result.errors).toBeUndefined();
      expect(result.data?.adminBookingById).toMatchObject({
        guestEmail: 'detail@example.test',
        items: [{ hotel: { title: expect.stringContaining('Test Hotel') } }],
        events: [
          { type: 'CREATED', payload: '{"step":1}' },
          { type: 'CONFIRMED', payload: '{"step":2}' },
        ],
      });

      const missing = await gql<{ adminBookingById: null }>(
        ADMIN_BOOKING_DETAIL,
        { id: 'missing-booking-id' },
      );
      expect(missing.errors).toBeUndefined();
      expect(missing.data?.adminBookingById).toBeNull();

      const genericBookingPii = await gql(
        '{ myBookings { guestEmail } }',
      );
      expect(genericBookingPii.errors?.[0].message).toContain(
        'Cannot query field "guestEmail" on type "Booking"',
      );
    } finally {
      currentUser = { id: 'test-agent', role: 'AGENT' };
      if (bookingId) await testPrisma.booking.delete({ where: { id: bookingId } });
      await fixture.cleanup();
    }
  });

  it('authorizes transitions, records audit events, and restores inventory on cancellation', async () => {
    const fixture = await createEphemeralHotel({ nights: 2, price: '120.00' });
    let bookingId: string | undefined;

    try {
      const booking = await testPrisma.booking.create({
        data: {
          reference: `AG-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
          guestName: 'Transition fixture',
          guestEmail: 'transition@example.test',
          status: 'PENDING',
          totalAmount: '240.00',
          currency: 'USD',
          idempotencyKey: randomUUID(),
          items: {
            create: {
              hotelId: fixture.hotelId,
              roomId: fixture.roomId,
              providerId: fixture.providerId,
              checkIn: fixture.checkIn,
              checkOut: fixture.checkOut,
              adults: 2,
              childrenAges: [],
              priceAmount: '240.00',
              currency: 'USD',
              status: 'PENDING',
            },
          },
        },
      });
      bookingId = booking.id;
      await testPrisma.roomInventory.updateMany({
        where: { roomId: fixture.roomId },
        data: { available: { decrement: 1 } },
      });

      currentUser = { id: 'test-customer', role: 'CUSTOMER' };
      const forbidden = await gql(TRANSITION_ADMIN_BOOKING, {
        id: booking.id,
        transition: 'CONFIRM',
      });
      expect(forbidden.errors?.[0].extensions?.code).toBe('FORBIDDEN');

      currentUser = { id: 'test-agent', role: 'AGENT' };
      const confirmed = await gql<{
        transitionAdminBooking: {
          status: string;
          confirmedAt: string | null;
          items: Array<{ status: string }>;
          events: Array<{ type: string; payload: string | null }>;
        };
      }>(TRANSITION_ADMIN_BOOKING, {
        id: booking.id,
        transition: 'CONFIRM',
      });
      expect(confirmed.errors).toBeUndefined();
      const confirmedBooking = confirmed.data!.transitionAdminBooking;
      expect(confirmedBooking.status).toBe('CONFIRMED');
      expect(confirmedBooking.items).toEqual([{ status: 'CONFIRMED' }]);
      expect(confirmedBooking.confirmedAt).not.toBeNull();
      expect(confirmedBooking.events).toHaveLength(1);
      expect(confirmedBooking.events[0].type).toBe('CONFIRMED');
      expect(JSON.parse(confirmedBooking.events[0].payload!)).toEqual({
        actorId: 'test-agent',
        fromStatus: 'PENDING',
        toStatus: 'CONFIRMED',
        reason: null,
      });

      const duplicateConfirmation = await gql(TRANSITION_ADMIN_BOOKING, {
        id: booking.id,
        transition: 'CONFIRM',
      });
      expect(duplicateConfirmation.errors?.[0].extensions?.code).toBe(
        'BAD_USER_INPUT',
      );

      const cancelled = await gql<{
        transitionAdminBooking: {
          status: string;
          cancelledAt: string | null;
          items: Array<{ status: string }>;
          events: Array<{ type: string; payload: string | null }>;
        };
      }>(TRANSITION_ADMIN_BOOKING, {
        id: booking.id,
        transition: 'CANCEL',
        reason: 'Solicitud del huésped',
      });
      expect(cancelled.errors).toBeUndefined();
      const cancelledBooking = cancelled.data!.transitionAdminBooking;
      expect(cancelledBooking.status).toBe('CANCELLED');
      expect(cancelledBooking.items).toEqual([{ status: 'CANCELLED' }]);
      expect(cancelledBooking.cancelledAt).not.toBeNull();
      const cancellationEvent = cancelledBooking.events.find(
        ({ type }) => type === 'CANCELLED',
      );
      expect(cancellationEvent).toBeDefined();
      expect(JSON.parse(cancellationEvent!.payload!)).toEqual({
        actorId: 'test-agent',
        fromStatus: 'CONFIRMED',
        toStatus: 'CANCELLED',
        reason: 'Solicitud del huésped',
      });

      const inventory = await testPrisma.roomInventory.findMany({
        where: { roomId: fixture.roomId },
      });
      expect(inventory).toHaveLength(2);
      expect(inventory.every(({ available }) => available === 5)).toBe(true);
    } finally {
      currentUser = { id: 'test-agent', role: 'AGENT' };
      if (bookingId) await testPrisma.booking.delete({ where: { id: bookingId } });
      await fixture.cleanup();
    }
  });
});
