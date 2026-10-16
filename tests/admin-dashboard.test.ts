import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { schema } from '../server/schema';
import type { Context, SessionUser } from '../server/context';
import { createEphemeralHotel } from './helpers/fixtures';
import { disconnectTestDb, testPrisma } from './helpers/db';

let currentUser: SessionUser | null = { id: 'test-admin', role: 'ADMIN' };

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

const ADMIN_HOTELS = /* GraphQL */ `
  query AdminHotels(
    $first: Int
    $query: String
    $status: AdminHotelStatus
  ) {
    adminHotels(first: $first, query: $query, status: $status) {
      edges {
        node { id title slug status categoryStars destination { name } }
      }
    }
  }
`;

const UPDATE_HOTEL = /* GraphQL */ `
  mutation UpdateHotel(
    $id: String!
    $title: String
    $categoryStars: Int
    $status: HotelStatus
    $description: String
  ) {
    adminUpdateHotel(
      id: $id
      title: $title
      categoryStars: $categoryStars
      status: $status
      description: $description
    ) {
      id
      title
      status
      categoryStars
      description
    }
  }
`;

const CREATE_MANUAL_HOTEL = /* GraphQL */ `
  mutation CreateManualHotel(
    $title: String!
    $categoryStars: Int!
    $destinationName: String!
    $destinationCode: String
    $countryCode: String!
  ) {
    createManualHotel(
      title: $title
      categoryStars: $categoryStars
      destinationName: $destinationName
      destinationCode: $destinationCode
      countryCode: $countryCode
    ) {
      id
      title
      status
      destination { name countryCode }
      rooms { name }
    }
  }
`;

const ADMIN_METRICS = /* GraphQL */ `
  query AdminMetrics($fromDate: Date, $toDate: Date) {
    adminBookingMetrics(fromDate: $fromDate, toDate: $toDate) {
      totalBookings
      pendingBookings
      confirmedBookings
      cancelledBookings
      failedBookings
      expiredBookings
      confirmedTotals { currency amount }
    }
  }
`;

describe('dashboard administrativo', () => {
  afterAll(async () => {
    currentUser = null;
    await disconnectTestDb();
  });

  it('protege el catálogo administrativo y permite filtrar por hotel y estado', async () => {
    const fixture = await createEphemeralHotel({ nights: 1, price: '100.00' });
    try {
      const hotel = await testPrisma.hotel.findUniqueOrThrow({
        where: { id: fixture.hotelId },
        select: { slug: true },
      });
      const suffix = hotel.slug.split('-').at(-1)!;

      currentUser = { id: 'test-customer', role: 'CUSTOMER' };
      const forbidden = await gql(ADMIN_HOTELS, { first: 10 });
      expect(forbidden.errors?.[0].extensions?.code).toBe('FORBIDDEN');

      currentUser = { id: 'test-agent', role: 'AGENT' };
      const result = await gql<{
        adminHotels: {
          edges: Array<{ node: { id: string; status: string; destination: { name: string } } }>;
        };
      }>(ADMIN_HOTELS, {
        first: 10,
        query: suffix,
        status: 'ACTIVE',
      });
      expect(result.errors).toBeUndefined();
      expect(result.data?.adminHotels.edges.map(({ node }) => node.id)).toContain(
        fixture.hotelId,
      );
      expect(
        result.data?.adminHotels.edges.find(({ node }) => node.id === fixture.hotelId)?.node,
      ).toMatchObject({
        status: 'ACTIVE',
        destination: { name: expect.stringContaining('Test Dest') },
      });
    } finally {
      currentUser = { id: 'test-admin', role: 'ADMIN' };
      await fixture.cleanup();
    }
  });

  it('restringe la edición de hoteles a ADMIN y mantiene el índice de búsqueda', async () => {
    const fixture = await createEphemeralHotel({ nights: 1, price: '100.00' });
    try {
      currentUser = { id: 'test-agent', role: 'AGENT' };
      const forbidden = await gql(UPDATE_HOTEL, {
        id: fixture.hotelId,
        status: 'INACTIVE',
      });
      expect(forbidden.errors?.[0].extensions?.code).toBe('FORBIDDEN');

      currentUser = { id: 'test-admin', role: 'ADMIN' };
      const updated = await gql<{
        adminUpdateHotel: {
          title: string;
          status: string;
          categoryStars: number;
          description: string | null;
        };
      }>(UPDATE_HOTEL, {
        id: fixture.hotelId,
        title: 'Hotel renovado',
        categoryStars: 5,
        status: 'DRAFT',
        description: 'Descripción nueva',
      });
      expect(updated.errors).toBeUndefined();
      expect(updated.data?.adminUpdateHotel).toMatchObject({
        title: 'Hotel renovado',
        status: 'DRAFT',
        categoryStars: 5,
        description: 'Descripción nueva',
      });

      const updatedSearchKey = await testPrisma.hotel.findUniqueOrThrow({
        where: { id: fixture.hotelId },
        select: { searchKey: true },
      });
      expect(updatedSearchKey.searchKey).toContain('hotel renovado');

      const invalid = await gql(UPDATE_HOTEL, {
        id: fixture.hotelId,
        categoryStars: 8,
      });
      expect(invalid.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
    } finally {
      currentUser = { id: 'test-admin', role: 'ADMIN' };
      await fixture.cleanup();
    }
  });

  it('permite crear hoteles manuales solo a ADMIN y valida los datos', async () => {
    const suffix = randomUUID().slice(0, 8);
    const destinationName = `Destino Admin ${suffix}`;
    let hotelId: string | undefined;

    try {
      currentUser = { id: 'test-agent', role: 'AGENT' };
      const forbidden = await gql(CREATE_MANUAL_HOTEL, {
        title: `Hotel ${suffix}`,
        categoryStars: 4,
        destinationName,
        destinationCode: 'TAD',
        countryCode: 'MX',
      });
      expect(forbidden.errors?.[0].extensions?.code).toBe('FORBIDDEN');

      currentUser = { id: 'test-admin', role: 'ADMIN' };
      const result = await gql<{
        createManualHotel: {
          id: string;
          title: string;
          status: string;
          destination: { name: string; countryCode: string };
          rooms: Array<{ name: string }>;
        };
      }>(CREATE_MANUAL_HOTEL, {
        title: `Hotel ${suffix}`,
        categoryStars: 4,
        destinationName,
        destinationCode: 'TAD',
        countryCode: 'MX',
      });
      expect(result.errors).toBeUndefined();
      const createdHotel = result.data!.createManualHotel;
      hotelId = createdHotel.id;
      expect(createdHotel).toMatchObject({
        title: `Hotel ${suffix}`,
        status: 'ACTIVE',
        destination: { name: destinationName, countryCode: 'MX' },
        rooms: [{ name: 'Standard' }],
      });

      const invalid = await gql(CREATE_MANUAL_HOTEL, {
        title: 'Invalid',
        categoryStars: 9,
        destinationName,
        destinationCode: 'TAD',
        countryCode: 'MX',
      });
      expect(invalid.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
    } finally {
      currentUser = { id: 'test-admin', role: 'ADMIN' };
      if (hotelId) {
        const hotel = await testPrisma.hotel.findUnique({
          where: { id: hotelId },
          select: { destinationId: true },
        });
        await testPrisma.hotel.delete({ where: { id: hotelId } });
        if (hotel) {
          await testPrisma.destination.deleteMany({
            where: { id: hotel.destinationId },
          });
        }
      }
    }
  });

  it('calcula conteos y montos confirmados agrupados por moneda en fechas inclusivas', async () => {
    const date = new Date('2098-08-15T12:00:00.000Z');
    const bookings = await Promise.all([
      testPrisma.booking.create({
        data: {
          reference: `AG-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
          guestName: 'Metrics confirmed usd',
          guestEmail: 'metrics@example.test',
          status: 'CONFIRMED',
          totalAmount: '100.25',
          currency: 'USD',
          idempotencyKey: randomUUID(),
          createdAt: date,
        },
      }),
      testPrisma.booking.create({
        data: {
          reference: `AG-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
          guestName: 'Metrics confirmed mxn',
          guestEmail: 'metrics@example.test',
          status: 'CONFIRMED',
          totalAmount: '250.00',
          currency: 'MXN',
          idempotencyKey: randomUUID(),
          createdAt: date,
        },
      }),
      testPrisma.booking.create({
        data: {
          reference: `AG-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
          guestName: 'Metrics pending',
          guestEmail: 'metrics@example.test',
          status: 'PENDING',
          totalAmount: '999.00',
          currency: 'USD',
          idempotencyKey: randomUUID(),
          createdAt: date,
        },
      }),
      testPrisma.booking.create({
        data: {
          reference: `AG-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`,
          guestName: 'Metrics outside range',
          guestEmail: 'metrics@example.test',
          status: 'CANCELLED',
          totalAmount: '80.00',
          currency: 'USD',
          idempotencyKey: randomUUID(),
          createdAt: new Date('2098-08-16T00:00:00.000Z'),
        },
      }),
    ]);

    try {
      const result = await gql<{
        adminBookingMetrics: {
          totalBookings: number;
          pendingBookings: number;
          confirmedBookings: number;
          cancelledBookings: number;
          confirmedTotals: Array<{ currency: string; amount: string }>;
        };
      }>(ADMIN_METRICS, {
        fromDate: '2098-08-15',
        toDate: '2098-08-15',
      });
      expect(result.errors).toBeUndefined();
      expect(result.data?.adminBookingMetrics).toMatchObject({
        totalBookings: 3,
        pendingBookings: 1,
        confirmedBookings: 2,
        cancelledBookings: 0,
        confirmedTotals: [
          { currency: 'MXN', amount: '250' },
          { currency: 'USD', amount: '100.25' },
        ],
      });

      currentUser = { id: 'test-customer', role: 'CUSTOMER' };
      const forbidden = await gql(ADMIN_METRICS);
      expect(forbidden.errors?.[0].extensions?.code).toBe('FORBIDDEN');
      currentUser = { id: 'test-admin', role: 'ADMIN' };

      const invalidRange = await gql(ADMIN_METRICS, {
        fromDate: '2098-08-20',
        toDate: '2098-08-01',
      });
      expect(invalidRange.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
    } finally {
      currentUser = { id: 'test-admin', role: 'ADMIN' };
      await testPrisma.booking.deleteMany({
        where: { id: { in: bookings.map(({ id }) => id) } },
      });
    }
  });
});
