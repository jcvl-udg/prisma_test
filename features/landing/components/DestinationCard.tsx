import Image from 'next/image';
import Link from 'next/link';

export interface FeaturedDestination {
  id: string;
  slug: string;
  name: string;
  countryCode: string;
  imageUrl: string | null;
  popularityScore: number;
}

interface DestinationCardProps {
  destination: FeaturedDestination;
}

function countryName(countryCode: string) {
  return new Intl.DisplayNames(['es'], { type: 'region' }).of(countryCode) ?? countryCode;
}

export function DestinationCard({ destination }: DestinationCardProps) {
  const country = countryName(destination.countryCode);

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <Link
        href={`/search?destinationId=${encodeURIComponent(destination.id)}`}
        className="block"
        aria-label={`Explorar hoteles en ${destination.name}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
          {destination.imageUrl ? (
            <Image
              src={destination.imageUrl}
              alt={`Paisaje de ${destination.name}, ${country}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div
              role="img"
              aria-label={`Imagen no disponible para ${destination.name}`}
              className="flex h-full items-center justify-center text-4xl text-slate-400"
            >
              ◇
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <h3 className="font-semibold text-slate-900">{destination.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{country}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-sky-700">
            Explorar <span aria-hidden="true">→</span>
          </span>
        </div>
      </Link>
    </article>
  );
}
