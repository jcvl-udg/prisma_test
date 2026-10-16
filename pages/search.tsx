import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLazyQuery } from '@apollo/client/react';
import { HotelCard } from '../features/catalog/components/HotelCard';
import { useBooking } from '../features/booking/BookingContext';
import { HotelFilterPanel } from '../features/search/components/HotelFilterPanel';
import { SearchBar, type SearchFilters } from '../features/search/components/SearchBar';
import {
  activeFilterChips,
  hasCatalogFilters,
  parseSearchFilterState,
  removeActiveFilter,
  searchParamsFor,
  type SearchFilterState,
} from '../features/search/filter-state';
import { graphql } from '../gql';
import { getDefaultStayDates, isValidStayDates, type StayDates } from '../lib/stay-dates';

const SEARCH_HOTELS_QUERY = graphql(`
  query SearchHotelsWithFacets(
    $filter: HotelFilter
    $sort: HotelSort
    $first: Int
    $after: String
    $last: Int
    $before: String
  ) {
    hotels(
      filter: $filter
      sort: $sort
      first: $first
      after: $after
      last: $last
      before: $before
    ) {
      edges {
        cursor
        node {
          id
          title
          categoryStars
          propertyType
          themes
          ratingAvg
          reviewCount
          destination { id name code }
          rooms { id name }
        }
      }
      pageInfo {
        startCursor
        endCursor
        hasNextPage
        hasPreviousPage
      }
    }
  }
`);

const HOTEL_FACETS_QUERY = graphql(`
  query SearchHotelFacets($filter: HotelFilter) {
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
`);

const HOTEL_BY_SLUG_QUERY = graphql(`
  query LandingHotelBySlug($slug: String!, $checkIn: Date, $checkOut: Date) {
    hotelBySlug(slug: $slug, checkIn: $checkIn, checkOut: $checkOut) {
      id
      title
      categoryStars
      destination { id name code }
      rooms { id name }
    }
  }
`);

function withSearchParams(state: SearchFilterState): string {
  const params = searchParamsFor(state);
  return params.size > 0 ? `/search?${params.toString()}` : '/search';
}

export default function SearchPage() {
  const router = useRouter();
  const { selection, clear, setDates } = useBooking();
  const [isHotelSlugSearch, setIsHotelSlugSearch] = useState(false);
  const [searchDates, setSearchDates] = useState<StayDates | null>(null);
  const searchState = useMemo(
    () => parseSearchFilterState(router.query),
    [router.isReady, router.asPath],
  );
  const filter = useMemo(
    () => ({
      query: searchState.query || undefined,
      destinationId: searchState.destinationId || undefined,
      checkIn: searchState.checkIn,
      checkOut: searchState.checkOut,
      adults: 2,
      children: 0,
      maxStars: null,
      minStars: searchState.minStars,
      minRating: searchState.minRating,
      minPrice: searchState.minPrice,
      maxPrice: searchState.maxPrice,
      propertyTypes: searchState.propertyTypes.length ? searchState.propertyTypes : undefined,
      themes: searchState.themes.length ? searchState.themes : undefined,
      amenities: searchState.amenities.length ? searchState.amenities : undefined,
      boardTypes: searchState.boardTypes.length ? searchState.boardTypes : undefined,
      cancellationTypes: searchState.cancellationTypes.length
        ? searchState.cancellationTypes
        : undefined,
    }),
    [searchState],
  );
  const filterKey = JSON.stringify(filter);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const [executeSearch, { data: searchData, loading: isSearchLoading, error: searchError }] =
    useLazyQuery(SEARCH_HOTELS_QUERY, { fetchPolicy: 'network-only' });
  const [executeFacets, { data: facetsData, error: facetsError }] =
    useLazyQuery(HOTEL_FACETS_QUERY, { fetchPolicy: 'network-only' });
  const [executeHotelBySlug, { data: hotelSearchData, loading: isHotelLoading, error: hotelError }] =
    useLazyQuery(HOTEL_BY_SLUG_QUERY, { fetchPolicy: 'network-only' });

  const handleSearchSubmit = (filters: SearchFilters) => {
    const next = parseSearchFilterState({
      query: filters.query,
      destinationId: filters.destinationId,
      checkIn: filters.checkIn,
      checkOut: filters.checkOut,
    });
    void router.push(withSearchParams(next));
  };

  const updateFilterState = (next: SearchFilterState) => {
    void router.push(withSearchParams(next), undefined, { shallow: true });
  };

  useEffect(() => {
    if (!router.isReady) return;

    const queryValue = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value;
    const hotelSlug = queryValue(router.query.hotelSlug);
    const checkIn = searchState.checkIn;
    const checkOut = searchState.checkOut;
    const stayDates =
      checkIn && checkOut && isValidStayDates(checkIn, checkOut)
        ? { checkIn, checkOut }
        : getDefaultStayDates();

    setSearchDates(stayDates);
    setDates(stayDates);

    if (!isValidStayDates(checkIn, checkOut)) {
      void router.replace(
        {
          pathname: router.pathname,
          query: { ...router.query, ...stayDates },
        },
        undefined,
        { shallow: true },
      );
      return;
    }

    if (hotelSlug) {
      setIsHotelSlugSearch(true);
      executeHotelBySlug({
        variables: { slug: hotelSlug, ...stayDates },
      });
      return;
    }

    setIsHotelSlugSearch(false);
    const hasSearchCriteria =
      Boolean(searchState.query || searchState.destinationId) || hasCatalogFilters(searchState);
    if (!hasSearchCriteria) return;

    const pageVariables = searchState.before
      ? { first: null, after: null, last: 20, before: searchState.before }
      : {
          first: 20,
          after: searchState.after || null,
          last: null,
          before: null,
        };

    executeSearch({
      variables: {
        filter,
        sort: searchState.sort,
        ...pageVariables,
      },
    });
  }, [
    executeHotelBySlug,
    executeSearch,
    router.isReady,
    router.pathname,
    router.query.hotelSlug,
    router.query.checkIn,
    router.query.checkOut,
    router.replace,
    filter,
    searchState,
    setDates,
  ]);

  useEffect(() => {
    if (!router.isReady || router.query.hotelSlug) return;
    const currentFilter = filterRef.current;
    const hasSearchCriteria = Boolean(currentFilter.query || currentFilter.destinationId)
      || currentFilter.minStars != null
      || currentFilter.minRating != null
      || currentFilter.minPrice != null
      || currentFilter.maxPrice != null
      || Boolean(currentFilter.propertyTypes?.length)
      || Boolean(currentFilter.themes?.length)
      || Boolean(currentFilter.amenities?.length)
      || Boolean(currentFilter.boardTypes?.length)
      || Boolean(currentFilter.cancellationTypes?.length);
    if (
      !hasSearchCriteria
      || !isValidStayDates(currentFilter.checkIn, currentFilter.checkOut)
    ) return;
    executeFacets({ variables: { filter: currentFilter } });
  }, [
    executeFacets,
    filterKey,
    router.isReady,
    router.query.hotelSlug,
  ]);

  const hotels = isHotelSlugSearch
    ? hotelSearchData?.hotelBySlug
      ? [hotelSearchData.hotelBySlug]
      : []
    : searchData?.hotels.edges.map(({ node }) => node) ?? [];
  const isSearching = isHotelSlugSearch ? isHotelLoading : isSearchLoading;
  const hasSearched = isHotelSlugSearch
    ? hotelSearchData !== undefined
    : searchData !== undefined;
  const error = isHotelSlugSearch ? hotelError : searchError ?? facetsError;
  const facets = facetsData?.hotelFacets;
  const chips = activeFilterChips(searchState);
  const pageInfo = searchData?.hotels.pageInfo;
  const edges = searchData?.hotels.edges ?? [];

  const movePage = (direction: 'next' | 'previous') => {
    const next = {
      ...searchState,
      after: direction === 'next' ? pageInfo?.endCursor ?? '' : '',
      before: direction === 'previous' ? pageInfo?.startCursor ?? '' : '',
    };
    updateFilterState(next);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans sm:p-8">
      <Head>
        <title>Buscar hoteles | Core</title>
      </Head>

      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Inventario Global
          </h1>
          <p className="mt-2 text-slate-500">
            Encuentra disponibilidad en tiempo real.
          </p>
        </div>

        <SearchBar
          initialDates={searchDates}
          initialQuery={searchState.query}
          onSearchSubmit={handleSearchSubmit}
          onDatesChange={(dates) => setDates(dates)}
        />

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)_260px]">
          {!isHotelSlugSearch && (
            <HotelFilterPanel
              filters={searchState}
              facets={facets}
              onChange={updateFilterState}
            />
          )}

          <main className="min-w-0 space-y-4" aria-live="polite">
            {!isHotelSlugSearch && chips.length > 0 && (
              <section aria-label="Filtros activos" className="rounded-lg border bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">Filtros activos</h2>
                  <button
                    type="button"
                    onClick={() =>
                      updateFilterState({
                        ...searchState,
                        minStars: undefined,
                        minRating: undefined,
                        minPrice: undefined,
                        maxPrice: undefined,
                        propertyTypes: [],
                        themes: [],
                        amenities: [],
                        boardTypes: [],
                        cancellationTypes: [],
                        after: '',
                        before: '',
                      })
                    }
                    className="text-xs text-slate-600 underline"
                  >
                    Limpiar filtros
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <button
                      key={`${chip.key}-${chip.value}`}
                      type="button"
                      onClick={() => updateFilterState(removeActiveFilter(searchState, chip))}
                      aria-label={`Quitar filtro ${chip.label}`}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
                    >
                      {chip.label} <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {searchState.query || searchState.destinationId || hasCatalogFilters(searchState) ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  {facets ? `${facets.total} hoteles encontrados` : 'Buscando hoteles…'}
                </p>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  Ordenar por
                  <select
                    aria-label="Ordenar resultados"
                    value={searchState.sort}
                    onChange={(event) =>
                      updateFilterState({
                        ...searchState,
                        sort: event.target.value as SearchFilterState['sort'],
                        after: '',
                        before: '',
                      })
                    }
                    className="rounded-md border border-slate-300 bg-white px-2 py-2"
                  >
                    <option value="POPULAR">Más populares</option>
                    <option value="PRICE_ASC">Precio: menor a mayor</option>
                    <option value="PRICE_DESC">Precio: mayor a menor</option>
                    <option value="RATING">Mejor calificados</option>
                    <option value="STARS">Más estrellas</option>
                  </select>
                </label>
              </div>
            ) : null}

            {isSearching && (
              <p className="animate-pulse text-slate-500">Consultando inventario…</p>
            )}
            {error && !isSearching && (
              <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                No se pudo completar la búsqueda. Inténtalo de nuevo.
              </p>
            )}
            {!isSearching && hotels.length === 0 && hasSearched && !error && (
              <p className="rounded-md bg-white p-4 text-slate-500">
                No se encontraron hoteles para esta búsqueda.
              </p>
            )}
            {!isSearching && !hasSearched && (
              <p className="rounded-md bg-white p-4 text-slate-500">
                Busca un destino o hotel para ver disponibilidad y filtrar resultados.
              </p>
            )}
            {!isSearching &&
              hotels.map((hotel) => <HotelCard key={hotel.id} hotel={hotel} />)}

            {!isHotelSlugSearch && hotels.length > 0 && (
              <nav aria-label="Paginación de resultados" className="flex justify-between pt-2">
                <button
                  type="button"
                  disabled={!pageInfo?.hasPreviousPage || isSearching}
                  onClick={() => movePage('previous')}
                  className="rounded-md border bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={!pageInfo?.hasNextPage || isSearching}
                  onClick={() => movePage('next')}
                  className="rounded-md border bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </nav>
            )}
          </main>

          <aside className="sticky top-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">Tu selección</h2>
              {selection && (
                <button
                  onClick={clear}
                  className="text-xs font-medium text-slate-400 transition-colors hover:text-red-600"
                >
                  Quitar
                </button>
              )}
            </div>

            {!selection ? (
              <p className="text-sm text-slate-500">
                Selecciona una habitación para continuar.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="border-l-2 border-slate-900 pl-3">
                  <p className="text-xs font-medium text-slate-500">
                    {selection.hotelName}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {selection.roomName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {selection.checkIn} → {selection.checkOut}
                  </p>
                  <p className="text-xs text-slate-500">
                    {selection.adults} adulto(s)
                    {selection.childrenAges.length > 0
                      ? `, ${selection.childrenAges.length} menor(es)`
                      : ''}
                  </p>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <Link
                    href="/checkout"
                    className="block w-full rounded-md bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Continuar a checkout
                  </Link>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
