import { useRouter } from 'next/router';
import { SearchBar, type SearchFilters } from '../../search/components/SearchBar';

export function Hero() {
  const router = useRouter();

  const handleSearch = (filters: SearchFilters) => {
    const params = new URLSearchParams();
    if (filters.query) params.set('query', filters.query);
    if (filters.destinationId) params.set('destinationId', filters.destinationId);
    if (filters.checkIn) params.set('checkIn', filters.checkIn);
    if (filters.checkOut) params.set('checkOut', filters.checkOut);

    void router.push(`/search${params.size ? `?${params.toString()}` : ''}`);
  };

  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-6 py-12 text-white sm:px-10 sm:py-16 lg:px-16">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">
          Aleca Travel
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Encuentra tu próximo lugar favorito
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-200">
          Descubre destinos únicos y compara hoteles para planear un viaje a tu
          medida.
        </p>
        <div className="mt-8 rounded-2xl bg-white p-3 text-slate-950 shadow-xl">
          <SearchBar onSearchSubmit={handleSearch} />
        </div>
      </div>
    </section>
  );
}
