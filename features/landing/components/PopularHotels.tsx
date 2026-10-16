import { PopularHotelCard, type PopularHotel } from './PopularHotelCard';

interface PopularHotelsProps {
  hotels: PopularHotel[];
}

export function PopularHotels({ hotels }: PopularHotelsProps) {
  return (
    <section aria-labelledby="popular-hotels-title">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-sky-700">
          Alojamientos que inspiran
        </p>
        <h2
          id="popular-hotels-title"
          className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl"
        >
          Hoteles populares
        </h2>
      </div>
      {hotels.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {hotels.map((hotel) => (
            <PopularHotelCard key={hotel.id} hotel={hotel} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-slate-600">
          No hay hoteles populares disponibles en este momento.
        </p>
      )}
    </section>
  );
}
