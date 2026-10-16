import { useBooking } from '../../booking/BookingContext';

interface Room {
  id: string;
  name: string;
}

interface HotelProps {
  hotel: {
    id: string;
    title: string;
    categoryStars: number;
    propertyType?: string;
    themes?: string[];
    ratingAvg?: number | null;
    reviewCount?: number;
    destination: { name: string; code?: string | null };
    rooms: Room[];
  };
}

export function HotelCard({ hotel }: HotelProps) {
  const { setSelection, dates } = useBooking();

  const handleSelect = (room: Room) => {
    if (!dates) {
      alert('Elegí fechas antes de seleccionar una habitación.');
      return;
    }
    setSelection({
      id: `${hotel.id}:${room.id}`, // clave única para saber si ya está seleccionada
      hotelId: hotel.id,
      hotelName: hotel.title,
      roomId: room.id,
      roomName: room.name,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      adults: 2,          // TODO(A8+): tomar de SearchBar cuando se agregue selector de huéspedes
      childrenAges: [],
    });
  };

  const { selection } = useBooking();
  const badges = [
    hotel.propertyType?.replaceAll('_', ' ').toLowerCase(),
    ...(hotel.themes ?? []).slice(0, 2).map((theme) => theme.replaceAll('_', ' ').toLowerCase()),
  ].filter((badge): badge is string => Boolean(badge));

  return (
    <div className="rounded-lg border border-slate-200 bg-white text-slate-950 shadow-sm transition-all hover:shadow-md">
      <div className="flex flex-col space-y-1.5 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold leading-none tracking-tight text-xl">{hotel.title}</h3>
          <span className="text-sm font-medium bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-full">
            {'⭐'.repeat(hotel.categoryStars)}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          📍 {hotel.destination.name}{' '}
          {hotel.destination.code ? `(${hotel.destination.code})` : ''}
        </p>
        {(badges.length > 0 || hotel.ratingAvg != null) && (
          <div aria-label={`Atributos de ${hotel.title}`} className="flex flex-wrap gap-2 pt-2">
            {hotel.ratingAvg != null && (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                {hotel.ratingAvg.toFixed(1)} / 10
                {hotel.reviewCount ? ` · ${hotel.reviewCount} reseñas` : ''}
              </span>
            )}
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium capitalize text-blue-800"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="p-6 pt-0">
        <h4 className="text-sm font-medium mb-3 text-slate-900">Habitaciones Disponibles</h4>
        <div className="space-y-2">
          {hotel.rooms.map((room) => {
            const isSelected = selection?.id === `${hotel.id}:${room.id}`;
            return (
              <div
                key={room.id}
                className="flex items-center justify-between rounded-md border border-slate-100 p-3 bg-slate-50"
              >
                <span className="text-sm font-medium">{room.name}</span>
                <button
                  onClick={() => handleSelect(room)}
                  disabled={!dates}
                  className={`inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-100'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isSelected ? 'Seleccionada' : 'Seleccionar'}
                </button>
              </div>
            );
          })}
          {hotel.rooms.length === 0 && (
            <p className="text-xs text-slate-500">Sin disponibilidad para este hotel.</p>
          )}
        </div>
      </div>
    </div>
  );
}