import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { SearchBar, type SearchFilters } from '../features/search/components/SearchBar';
import { HotelCard } from '../features/catalog/components/HotelCard';
import { useBooking } from '../features/booking/BookingContext';
import { graphql } from '../gql';
import { useLazyQuery } from '@apollo/client/react';

const FULL_SEARCH_QUERY = graphql(`
  query FullSearch($query: String, $destinationId: String, $take: Int) {
    searchHotels(query: $query, destinationId: $destinationId, take: $take) {
      id
      title
      categoryStars
      destination { id name code }
      rooms { id name }
    }
  }
`);

const HOTEL_BY_SLUG_QUERY = graphql(`
  query LandingHotelBySlug($slug: String!) {
    hotelBySlug(slug: $slug) {
      id
      title
      categoryStars
      destination { id name code }
      rooms { id name }
    }
  }
`);

export default function SearchPage() {
  const router = useRouter();
  const { selection, clear, setDates } = useBooking();
  const [isHotelSlugSearch, setIsHotelSlugSearch] = useState(false);

  const [executeSearch, { data: searchData, loading: isSearchLoading }] =
    useLazyQuery(FULL_SEARCH_QUERY, { fetchPolicy: 'network-only' });
  const [executeHotelBySlug, { data: hotelSearchData, loading: isHotelLoading }] =
    useLazyQuery(HOTEL_BY_SLUG_QUERY, { fetchPolicy: 'network-only' });

  const handleSearchSubmit = (filters: SearchFilters) => {
    setIsHotelSlugSearch(false);
    executeSearch({
      variables: {
        query: filters.query || null,
        destinationId: filters.destinationId ?? null,
        take: 20,
      },
    });
  };

  useEffect(() => {
    if (!router.isReady) return;

    const queryValue = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value;
    const hotelSlug = queryValue(router.query.hotelSlug);
    const destinationId = queryValue(router.query.destinationId);
    const query = queryValue(router.query.query);
    const checkIn = queryValue(router.query.checkIn);
    const checkOut = queryValue(router.query.checkOut);

    if (checkIn || checkOut) {
      setDates(
        checkIn && checkOut && checkOut > checkIn
          ? { checkIn, checkOut }
          : null,
      );
    }

    if (hotelSlug) {
      setIsHotelSlugSearch(true);
      executeHotelBySlug({ variables: { slug: hotelSlug } });
      return;
    }

    setIsHotelSlugSearch(false);
    if (!destinationId && !query) return;

    executeSearch({
      variables: { query: query ?? null, destinationId: destinationId ?? null, take: 20 },
    });
  }, [
    executeSearch,
    executeHotelBySlug,
    router.isReady,
    router.query.destinationId,
    router.query.hotelSlug,
    router.query.query,
    router.query.checkIn,
    router.query.checkOut,
    setDates,
  ]);

  const hotels = isHotelSlugSearch
    ? hotelSearchData?.hotelBySlug
      ? [hotelSearchData.hotelBySlug]
      : []
    : searchData?.searchHotels ?? [];
  const isSearching = isHotelSlugSearch ? isHotelLoading : isSearchLoading;
  const hasSearched = isHotelSlugSearch
    ? hotelSearchData !== undefined
    : searchData !== undefined;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <Head>
        <title>Reserva B2B | Core</title>
      </Head>

      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Inventario Global
            </h1>
            <p className="text-slate-500 mt-2">
              Encuentra disponibilidad en tiempo real.
            </p>
          </div>

          <SearchBar
            onSearchSubmit={handleSearchSubmit}
            onDatesChange={(d) => setDates(d.checkIn && d.checkOut ? d : null)}
          />

          <div className="space-y-4 mt-8">
            {isSearching && (
              <p className="text-slate-500 animate-pulse">Consultando inventario…</p>
            )}
            {!isSearching && hotels.length === 0 && hasSearched && (
              <p className="text-slate-500">
                No se encontraron hoteles para esta búsqueda.
              </p>
            )}
            {!isSearching &&
              hotels.map((hotel) => <HotelCard key={hotel.id} hotel={hotel} />)}
          </div>
        </div>

        <div className="md:col-span-1">
          <div className="sticky top-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Tu selección</h2>
              {selection && (
                <button
                  onClick={clear}
                  className="text-xs font-medium text-slate-400 hover:text-red-600 transition-colors"
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
                  <p className="text-xs text-slate-500 mt-1">
                    {selection.checkIn} → {selection.checkOut}
                  </p>
                  <p className="text-xs text-slate-500">
                    {selection.adults} adulto(s)
                    {selection.childrenAges.length > 0
                      ? `, ${selection.childrenAges.length} menor(es)`
                      : ''}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4">
                  <Link
                    href="/checkout"
                    className="block w-full rounded-md bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Continuar a checkout
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}