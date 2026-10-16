import { DestinationCard, type FeaturedDestination } from './DestinationCard';

interface FeaturedDestinationsProps {
  destinations: FeaturedDestination[];
}

export function FeaturedDestinations({ destinations }: FeaturedDestinationsProps) {
  return (
    <section aria-labelledby="featured-destinations-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-sky-700">
            Inspiración para viajar
          </p>
          <h2
            id="featured-destinations-title"
            className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl"
          >
            Destinos destacados
          </h2>
        </div>
        <span className="text-sm text-slate-500">Lugares para tu próxima aventura</span>
      </div>
      {destinations.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((destination) => (
            <DestinationCard key={destination.id} destination={destination} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-slate-600">
          Pronto agregaremos destinos destacados. Mientras tanto, puedes explorar
          todos los hoteles.
        </p>
      )}
    </section>
  );
}
