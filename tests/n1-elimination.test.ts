import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { createYoga } from 'graphql-yoga';
import { Pool } from 'pg';
import { PrismaClient } from '../prisma/generated/client';
import { schema } from '../server/schema';
import type { Context } from '../server/context';
import { createEphemeralHotel } from './helpers/fixtures';
import { disconnectTestDb, testPrisma } from './helpers/db';

const queryPrisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL! })),
  log: [{ emit: 'event', level: 'query' }],
});

const yoga = createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  logging: false,
  maskedErrors: false,
  context: () =>
    ({
      prisma: queryPrisma,
      user: null,
      anonymousId: null,
    }) as unknown as Context,
});

const HOTELS_WITH_RELATIONS_QUERY = /* GraphQL */ `
  query HotelsWithRelations($filter: HotelFilter) {
    hotels(filter: $filter, first: 20) {
      edges {
        node {
          id
          destination { name }
          rooms { name }
          amenities { amenity { name } }
          images { url }
        }
      }
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

describe('N+1 elimination', () => {
  afterAll(async () => {
    await queryPrisma.$disconnect();
    await disconnectTestDb();
  });

  it('loads relations for 20 hotels in at most 10 SQL queries', async () => {
    const fixture = await createEphemeralHotel({ nights: 1, price: '100.00' });
    const suffix = randomUUID();
    const extraHotelSlugs = Array.from(
      { length: 19 },
      (_, index) => `n1-${suffix}-${index}`,
    );
    let amenityCode: string | undefined;

    try {
      await testPrisma.hotel.update({
        where: { id: fixture.hotelId },
        data: { mainImageUrl: `https://example.test/${suffix}/0.jpg` },
      });

      await testPrisma.hotel.createMany({
        data: extraHotelSlugs.map((slug, index) => ({
          slug,
          title: `N1 Hotel ${index}`,
          categoryStars: 4,
          status: 'ACTIVE',
          searchKey: `n1 hotel ${index}`,
          destinationId: fixture.destinationId,
          mainImageUrl: `https://example.test/${suffix}/${index + 1}.jpg`,
        })),
      });

      const hotels = await testPrisma.hotel.findMany({
        where: { destinationId: fixture.destinationId },
        select: { id: true, slug: true },
      });
      const hotelIds = hotels.map(({ id }) => id);
      expect(hotelIds).toHaveLength(20);

      await testPrisma.room.createMany({
        data: hotels
          .filter(({ id }) => id !== fixture.hotelId)
          .map(({ id }, index) => ({
            hotelId: id,
            name: `Room ${index + 1}`,
            code: `N1-${index + 1}`,
            maxAdults: 2,
            maxChildren: 1,
          })),
      });
      await testPrisma.hotelImage.createMany({
        data: hotels.map(({ id }, index) => ({
          hotelId: id,
          url: `https://example.test/${suffix}/${index}.jpg`,
          position: 0,
        })),
      });

      amenityCode = `N1_${suffix.replaceAll('-', '').slice(0, 20).toUpperCase()}`;
      const amenity = await testPrisma.amenity.create({
        data: { code: amenityCode, name: 'N+1 test amenity', category: 'TEST' },
        select: { id: true },
      });
      await testPrisma.hotelAmenity.createMany({
        data: hotelIds.map((hotelId) => ({ hotelId, amenityId: amenity.id })),
      });

      const sqlQueries: string[] = [];
      let recordingQueries = true;
      queryPrisma.$on('query', (event) => {
        if (recordingQueries) sqlQueries.push(event.query);
      });

      let result: Awaited<ReturnType<typeof gql>>;
      try {
        result = await gql(HOTELS_WITH_RELATIONS_QUERY, {
          filter: { destinationId: fixture.destinationId },
        });
      } finally {
        recordingQueries = false;
      }

      expect(result!.errors).toBeUndefined();
      expect(result!.data.hotels.edges).toHaveLength(20);
      expect(
        result!.data.hotels.edges.every(
          (edge: {
            node: {
              destination: { name: string };
              rooms: { name: string }[];
              amenities: { amenity: { name: string } }[];
              images: { url: string }[];
            };
          }) =>
            edge.node.destination.name.length > 0 &&
            edge.node.rooms.length > 0 &&
            edge.node.amenities.length > 0 &&
            edge.node.images.length > 0,
        ),
      ).toBe(true);
      console.info(`B1c query count: ${sqlQueries.length} SQL queries for 20 hotels and relations.`);
      expect(sqlQueries.length).toBeLessThanOrEqual(10);
    } finally {
      const remainingHotels = await testPrisma.hotel.findMany({
        where: { slug: { in: extraHotelSlugs } },
        select: { id: true },
      });
      await testPrisma.hotel.deleteMany({
        where: { id: { in: remainingHotels.map(({ id }) => id) } },
      });
      if (amenityCode) {
        await testPrisma.amenity.deleteMany({ where: { code: amenityCode } });
      }
      await fixture.cleanup();
    }
  });
});
