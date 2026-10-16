import Image from 'next/image';
import Link from 'next/link';

export interface PopularHotel {
  id: string;
  slug: string;
  title: string;
  categoryStars: number;
  ratingAvg: number | null;
  reviewCount: number;
  priceFrom: string | null;
  priceCurrency: string;
  mainImageUrl: string | null;
  destination: {
    name: string;
    code: string | null;
  };
}

interface PopularHotelCardProps {
  hotel: PopularHotel;
}

function formatPrice(priceFrom: string, currency: string) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(priceFrom));
}

export function PopularHotelCard({ hotel }: PopularHotelCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <Link
        href={`/search?hotelSlug=${encodeURIComponent(hotel.slug)}`}
        className="group block"
        aria-label={`Ver disponibilidad en ${hotel.title}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
          {hotel.mainImageUrl ? (
            <Image
              src={hotel.mainImageUrl}
              alt={`Hotel ${hotel.title} en ${hotel.destination.name}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div
              role="img"
              aria-label={`Imagen no disponible para ${hotel.title}`}
              className="flex h-full items-center justify-center text-4xl text-slate-400"
            >
              ◇
            </div>
          )}
        </div>
        <div className="space-y-3 p-4">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900">{hotel.title}</h3>
              <span className="shrink-0 text-sm text-amber-600" aria-label={`${hotel.categoryStars} estrellas`}>
                {'★'.repeat(hotel.categoryStars)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {hotel.destination.name}
              {hotel.destination.code ? ` · ${hotel.destination.code}` : ''}
            </p>
          </div>
          <div className="flex min-h-10 items-end justify-between gap-2 border-t border-slate-100 pt-3">
            <div>
              {hotel.ratingAvg != null ? (
                <p className="text-sm font-medium text-slate-700">
                  <span aria-label={`Calificación ${hotel.ratingAvg.toFixed(1)} de 10`}>
                    ★ {hotel.ratingAvg.toFixed(1)}
                  </span>
                  <span className="ml-1 text-xs text-slate-500">
                    ({hotel.reviewCount} reseñas)
                  </span>
                </p>
              ) : (
                <p className="text-sm text-slate-500">Sin calificaciones</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {hotel.priceFrom == null
                  ? 'Consultar precio'
                  : <>Desde {formatPrice(hotel.priceFrom, hotel.priceCurrency)} por noche</>}
              </p>
            </div>
            <span className="shrink-0 text-right text-sm font-semibold text-sky-700">
              Ver disponibilidad <span aria-hidden="true">→</span>
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
