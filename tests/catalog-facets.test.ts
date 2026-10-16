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

const HOTEL_FACETS_QUERY = /* GraphQL */ `
  query HotelFacets($filter: HotelFilter) {
    hotelFacets(filter: $filter) {
      total
      stars { value count }
      propertyTypes { value count }
      themes { value count }
      amenities { value count }
      boardTypes { value count }
      cancellationTypes { value count }
      priceBuckets { value count }
    }
  }
`;

const FILTERED_HOTELS_QUERY = /* GraphQL */ `
  query FilteredHotels($filter: HotelFilter, $first: Int) {
    hotels(filter: $filter, first: $first) {
      edges { node { id propertyType } }
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

const counts = (items: { value: string; count: number }[]) =>
  Object.fromEntries(items.map(({ value, count }) => [value, count]));

describe('hotel search facets', () => {
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('aggregates facet values for exactly the hotels matched by the search filter', async () => {
    const fx = await createEphemeralHotel({ nights: 7, price: '100.00' });
    let secondHotelId: string | undefined;

    try {
      const secondHotel = await testPrisma.hotel.create({
        data: {
          slug: `facet-hotel-${fx.hotelId}`,
          title: 'Facet Hotel',
          categoryStars: 5,
          status: 'ACTIVE',
          searchKey: 'facet hotel',
          destinationId: fx.destinationId,
          propertyType: 'HOTEL',
          themes: ['beach'],
          amenityCodes: ['POOL'],
          boardTypes: ['BREAKFAST'],
          cancellationType: 'PARTIAL',
          priceBucket: 'MID_RANGE',
        },
        select: { id: true },
      });
      secondHotelId = secondHotel.id;

      await testPrisma.hotel.update({
        where: { id: fx.hotelId },
        data: {
          themes: ['beach', 'family'],
          amenityCodes: ['POOL', 'SPA'],
          propertyType: 'RESORT',
          boardTypes: ['ALL_INCLUSIVE', 'BREAKFAST'],
          cancellationType: 'FREE',
          priceBucket: 'PREMIUM',
        },
      });

      const response = await gql(HOTEL_FACETS_QUERY, {
        filter: { destinationId: fx.destinationId },
      });

      expect(response.errors).toBeUndefined();
      expect(response.data.hotelFacets.total).toBe(2);
      expect(counts(response.data.hotelFacets.stars)).toEqual({ '4': 1, '5': 1 });
      expect(counts(response.data.hotelFacets.propertyTypes)).toEqual({ HOTEL: 1, RESORT: 1 });
      expect(counts(response.data.hotelFacets.themes)).toEqual({ beach: 2, family: 1 });
      expect(counts(response.data.hotelFacets.amenities)).toEqual({ POOL: 2, SPA: 1 });
      expect(counts(response.data.hotelFacets.boardTypes)).toEqual({
        ALL_INCLUSIVE: 1,
        BREAKFAST: 2,
      });
      expect(counts(response.data.hotelFacets.cancellationTypes)).toEqual({
        FREE: 1,
        PARTIAL: 1,
      });
      expect(counts(response.data.hotelFacets.priceBuckets)).toEqual({
        MID_RANGE: 1,
        PREMIUM: 1,
      });

      const filtered = await gql(HOTEL_FACETS_QUERY, {
        filter: { destinationId: fx.destinationId, minStars: 5 },
      });
      expect(filtered.errors).toBeUndefined();
      expect(filtered.data.hotelFacets.total).toBe(1);
      expect(filtered.data.hotelFacets.propertyTypes).toEqual([
        { value: 'HOTEL', count: 1 },
      ]);

      const filteredByAmenity = await gql(HOTEL_FACETS_QUERY, {
        filter: { destinationId: fx.destinationId, minStars: 5, amenities: ['POOL'] },
      });
      expect(filteredByAmenity.errors).toBeUndefined();
      expect(filteredByAmenity.data.hotelFacets.total).toBe(1);

      const filteredByFacets = await gql(FILTERED_HOTELS_QUERY, {
        filter: {
          destinationId: fx.destinationId,
          propertyTypes: ['HOTEL'],
          boardTypes: ['BREAKFAST'],
          cancellationTypes: ['PARTIAL'],
        },
        first: 20,
      });
      expect(filteredByFacets.errors).toBeUndefined();
      expect(filteredByFacets.data.hotels.edges).toHaveLength(1);
      expect(filteredByFacets.data.hotels.edges[0].node.propertyType).toBe('HOTEL');

      const invalidFacet = await gql(FILTERED_HOTELS_QUERY, {
        filter: { destinationId: fx.destinationId, propertyTypes: ['NOT_A_PROPERTY'] },
        first: 20,
      });
      expect(invalidFacet.errors?.[0].message).toMatch(/tipo de alojamiento/i);
    } finally {
      if (secondHotelId) {
        await testPrisma.hotel.delete({ where: { id: secondHotelId } });
      }
      await fx.cleanup();
    }
  });

  it('returns empty facet lists when no hotel matches', async () => {
    const response = await gql(HOTEL_FACETS_QUERY, {
      filter: { destinationId: 'missing-facet-destination' },
    });

    expect(response.errors).toBeUndefined();
    expect(response.data.hotelFacets).toEqual({
      total: 0,
      stars: [],
      propertyTypes: [],
      themes: [],
      amenities: [],
      boardTypes: [],
      cancellationTypes: [],
      priceBuckets: [],
    });
  });
});
