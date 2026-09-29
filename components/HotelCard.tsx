import { useCart } from '../context/CartContext';

interface Room {
  id: string;
  name: string;
}

interface HotelProps {
  hotel: {
    id: string;
    title: string;
    categoryStars: number;
    destination: { name: string; code: string | null };
    rooms: Room[];
  };
}

export function HotelCard({ hotel }: HotelProps) {
  const { addToCart } = useCart();

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
          📍 {hotel.destination.name} {hotel.destination.code ? `(${hotel.destination.code})` : ''}
        </p>
      </div>

      <div className="p-6 pt-0">
        <h4 className="text-sm font-medium mb-3 text-slate-900">Habitaciones Disponibles</h4>
        <div className="space-y-2">
          {hotel.rooms.map((room) => (
            <div key={room.id} className="flex items-center justify-between rounded-md border border-slate-100 p-3 bg-slate-50">
              <span className="text-sm font-medium">{room.name}</span>
              <button
                onClick={() => addToCart({
                  hotelId: hotel.id,
                  hotelName: hotel.title,
                  roomId: room.id,
                  roomName: room.name,
                })}
                className="inline-flex h-8 items-center justify-center rounded-md bg-white border border-slate-200 px-3 text-xs font-medium transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                Agregar al Carrito
              </button>
            </div>
          ))}
          {hotel.rooms.length === 0 && (
            <p className="text-xs text-slate-500">Sin disponibilidad para este hotel.</p>
          )}
        </div>
      </div>
    </div>
  );
}