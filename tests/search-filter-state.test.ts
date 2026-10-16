import { describe, expect, it } from 'vitest';
import {
  activeFilterChips,
  hasCatalogFilters,
  parseSearchFilterState,
  removeActiveFilter,
  searchParamsFor,
} from '../features/search/filter-state';

describe('search filter URL state', () => {
  it('round-trips repeated facet values and search options through the URL', () => {
    const initial = parseSearchFilterState({
      query: 'Cancún',
      destinationId: 'destination-1',
      checkIn: '2030-06-15',
      checkOut: '2030-06-22',
      minStars: '4',
      minRating: '8',
      minPrice: '100',
      maxPrice: '500',
      propertyType: ['RESORT', 'HOTEL', 'RESORT'],
      theme: ['beach'],
      amenity: ['POOL', 'SPA'],
      boardType: ['BREAKFAST'],
      cancellationType: ['FREE'],
      sort: 'PRICE_ASC',
      after: 'cursor-next',
    });

    const params = searchParamsFor(initial);
    const query = Object.fromEntries(
      [...new Set(params.keys())].map((key) => {
        const values = params.getAll(key);
        return [key, values.length > 1 ? values : values[0]];
      }),
    );
    const restored = parseSearchFilterState(query);
    expect(restored).toEqual(initial);
    expect(restored.propertyTypes).toEqual(['RESORT', 'HOTEL']);
    expect(restored.amenities).toEqual(['POOL', 'SPA']);
  });

  it('uses safe defaults for malformed values and unsupported sort keys', () => {
    expect(parseSearchFilterState({
      minStars: 'not-a-number',
      minPrice: '-',
      sort: 'ARBITRARY',
      theme: ['', 'beach', 'beach'],
    })).toMatchObject({
      minStars: undefined,
      minPrice: undefined,
      sort: 'POPULAR',
      themes: ['beach'],
      after: '',
      before: '',
    });
  });

  it('lists active filters, removes the selected value and resets cursors', () => {
    const state = parseSearchFilterState({
      query: 'Cancún',
      minStars: '4',
      amenity: ['POOL', 'SPA'],
      after: 'cursor-next',
    });
    const chips = activeFilterChips(state);
    expect(chips.map(({ label }) => label)).toContain('4+ estrellas');
    expect(chips.map(({ label }) => label)).toContain('pool');

    const next = removeActiveFilter(
      state,
      chips.find(({ key, value }) => key === 'amenities' && value === 'POOL')!,
    );
    expect(next.amenities).toEqual(['SPA']);
    expect(next.after).toBe('');
    expect(next.before).toBe('');
    expect(hasCatalogFilters(next)).toBe(true);

    const cleared = removeActiveFilter(
      next,
      activeFilterChips(next).find(({ key }) => key === 'minStars')!,
    );
    expect(cleared.minStars).toBeUndefined();
  });
});
