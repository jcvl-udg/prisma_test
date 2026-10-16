export type CatalogSort = 'POPULAR' | 'PRICE_ASC' | 'PRICE_DESC' | 'RATING' | 'STARS';

export type SearchFilterState = {
  query: string;
  destinationId: string;
  checkIn: string;
  checkOut: string;
  minStars?: number;
  minRating?: number;
  minPrice?: number;
  maxPrice?: number;
  propertyTypes: string[];
  themes: string[];
  amenities: string[];
  boardTypes: string[];
  cancellationTypes: string[];
  sort: CatalogSort;
  after: string;
  before: string;
};

export type SearchQueryValues = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function list(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function number(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const SORTS: CatalogSort[] = ['POPULAR', 'PRICE_ASC', 'PRICE_DESC', 'RATING', 'STARS'];

export function parseSearchFilterState(query: SearchQueryValues): SearchFilterState {
  const sort = first(query.sort);
  return {
    query: first(query.query)?.trim() ?? '',
    destinationId: first(query.destinationId) ?? '',
    checkIn: first(query.checkIn) ?? '',
    checkOut: first(query.checkOut) ?? '',
    minStars: number(first(query.minStars)),
    minRating: number(first(query.minRating)),
    minPrice: number(first(query.minPrice)),
    maxPrice: number(first(query.maxPrice)),
    propertyTypes: list(query.propertyType),
    themes: list(query.theme),
    amenities: list(query.amenity),
    boardTypes: list(query.boardType),
    cancellationTypes: list(query.cancellationType),
    sort: SORTS.includes(sort as CatalogSort) ? sort as CatalogSort : 'POPULAR',
    after: first(query.after) ?? '',
    before: first(query.before) ?? '',
  };
}

export function searchParamsFor(state: SearchFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query) params.set('query', state.query);
  if (state.destinationId) params.set('destinationId', state.destinationId);
  if (state.checkIn) params.set('checkIn', state.checkIn);
  if (state.checkOut) params.set('checkOut', state.checkOut);
  if (state.minStars != null) params.set('minStars', String(state.minStars));
  if (state.minRating != null) params.set('minRating', String(state.minRating));
  if (state.minPrice != null) params.set('minPrice', String(state.minPrice));
  if (state.maxPrice != null) params.set('maxPrice', String(state.maxPrice));
  if (state.sort !== 'POPULAR') params.set('sort', state.sort);
  if (state.after) params.set('after', state.after);
  if (state.before) params.set('before', state.before);

  for (const value of state.propertyTypes) params.append('propertyType', value);
  for (const value of state.themes) params.append('theme', value);
  for (const value of state.amenities) params.append('amenity', value);
  for (const value of state.boardTypes) params.append('boardType', value);
  for (const value of state.cancellationTypes) params.append('cancellationType', value);
  return params;
}

export type ActiveFilterChip = {
  key: keyof SearchFilterState;
  value: string;
  label: string;
};

export function activeFilterChips(state: SearchFilterState): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (state.query) chips.push({ key: 'query', value: state.query, label: `Búsqueda: ${state.query}` });
  if (state.destinationId) {
    chips.push({ key: 'destinationId', value: state.destinationId, label: `Destino: ${state.destinationId}` });
  }
  if (state.minStars != null) {
    chips.push({ key: 'minStars', value: String(state.minStars), label: `${state.minStars}+ estrellas` });
  }
  if (state.minRating != null) {
    chips.push({ key: 'minRating', value: String(state.minRating), label: `Calificación ${state.minRating}+` });
  }
  if (state.minPrice != null || state.maxPrice != null) {
    chips.push({
      key: 'minPrice',
      value: `${state.minPrice ?? ''}:${state.maxPrice ?? ''}`,
      label: `Precio: ${state.minPrice ?? '0'}–${state.maxPrice ?? 'sin máximo'}`,
    });
  }

  const groups: Array<[keyof SearchFilterState, string[]]> = [
    ['propertyTypes', state.propertyTypes],
    ['themes', state.themes],
    ['amenities', state.amenities],
    ['boardTypes', state.boardTypes],
    ['cancellationTypes', state.cancellationTypes],
  ];
  for (const [key, values] of groups) {
    for (const value of values) {
      chips.push({ key, value, label: value.replaceAll('_', ' ').toLowerCase() });
    }
  }
  return chips;
}

export function removeActiveFilter(
  state: SearchFilterState,
  chip: ActiveFilterChip,
): SearchFilterState {
  const next = { ...state, after: '', before: '' };
  if (
    chip.key === 'propertyTypes'
    || chip.key === 'themes'
    || chip.key === 'amenities'
    || chip.key === 'boardTypes'
    || chip.key === 'cancellationTypes'
  ) {
    next[chip.key] = next[chip.key].filter((value) => value !== chip.value);
  } else if (chip.key === 'minPrice') {
    next.minPrice = undefined;
    next.maxPrice = undefined;
  } else if (chip.key === 'minStars') {
    next.minStars = undefined;
  } else if (chip.key === 'minRating') {
    next.minRating = undefined;
  } else if (chip.key === 'query') {
    next.query = '';
  } else if (chip.key === 'destinationId') {
    next.destinationId = '';
  }
  return next;
}

export function hasCatalogFilters(state: SearchFilterState): boolean {
  return state.minStars != null
    || state.minRating != null
    || state.minPrice != null
    || state.maxPrice != null
    || state.propertyTypes.length > 0
    || state.themes.length > 0
    || state.amenities.length > 0
    || state.boardTypes.length > 0
    || state.cancellationTypes.length > 0;
}
