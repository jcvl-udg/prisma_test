import { afterAll, describe, expect, it } from 'vitest';
import { createYoga } from 'graphql-yoga';
import { schema } from '../server/schema';
import type { Context } from '../server/context';
import { createEphemeralHotel } from './helpers/fixtures';
import { disconnectTestDb, testPrisma } from './helpers/db';

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

const SEARCH_WITH_AVAILABILITY = /* GraphQL */ `
  query SearchWithAvailability(
    $destinationId: String!
    $slug: String!
    $checkIn: Date!
    $checkOut: Date!
  ) {
    searchHotels(
      destinationId: $destinationId
      checkIn: $checkIn
      checkOut: $checkOut
    ) {
      id
    }
    hotelBySlug(slug: $slug, checkIn: $checkIn, checkOut: $checkOut) {
      id
    }
  }
`;

async function gql(query: string, variables: Record<string, unknown>) {
  const response = await yoga.fetch('http://test/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

describe('search availability filters', () => {
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('returns the destination and exact hotel only when every requested night is available', async () => {
    const fx = await createEphemeralHotel({ nights: 7, price: '100.00' });
    try {
      const hotel = await testPrisma.hotel.findUniqueOrThrow({
        where: { id: fx.hotelId },
        select: { slug: true },
      });
      const variables = {
        destinationId: fx.destinationId,
        slug: hotel.slug,
        checkIn: toDateOnly(fx.checkIn),
        checkOut: toDateOnly(fx.checkOut),
      };

      const available = await gql(SEARCH_WITH_AVAILABILITY, variables);
      expect(available.errors).toBeUndefined();
      expect(available.data.searchHotels.map((hotel: { id: string }) => hotel.id)).toContain(
        fx.hotelId,
      );
      expect(available.data.hotelBySlug.id).toBe(fx.hotelId);

      const unavailableNight = new Date(fx.checkIn.getTime() + 3 * 86_400_000);
      await testPrisma.roomInventory.update({
        where: {
          roomId_date: { roomId: fx.roomId, date: unavailableNight },
        },
        data: { available: 0 },
      });

      const unavailable = await gql(SEARCH_WITH_AVAILABILITY, variables);
      expect(unavailable.errors).toBeUndefined();
      expect(unavailable.data.searchHotels).not.toContainEqual({ id: fx.hotelId });
      expect(unavailable.data.hotelBySlug).toBeNull();
    } finally {
      await fx.cleanup();
    }
  });
});
