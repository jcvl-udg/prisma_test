import { useState } from 'react';
import Head from 'next/head';
import { SearchBar } from '../components/SearchBar';
import { HotelCard } from '../components/HotelCard';
import { useCart } from '../context/CartContext';

// Tipos
interface Room {
  id: string;
  name: string;
}

interface Hotel {
  id: string;
  title: string;
  categoryStars: number;
  destination: { name: string; code: string | null };
  rooms: Room[];
}

export default function SearchPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { items: cartItems, removeFromCart } = useCart();

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query FullSearch($query: String, $take: Int) {
              searchHotels(query: $query, take: $take) {
                id
                title
                categoryStars
                destination { id name code }
                rooms { id name }
              }
            }
          `,
          variables: { query: query !== '' ? query : null, take: 20 },
        }),
      });

      const { data, errors } = await response.json();
      if (errors) throw new Error(errors[0].message);
      setHotels(data?.searchHotels || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <Head>
        <title>Reserva B2B | Core</title>
      </Head>

      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Main Search Column */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Inventario Global</h1>
            <p className="text-slate-500 mt-2">Encuentra disponibilidad en tiempo real.</p>
          </div>

          <SearchBar 
            onSearchSubmit={handleSearch}
            onSelect={handleSearch} // Si selecciona del autocomplete, dispara la búsqueda profunda
          />

          <div className="space-y-4 mt-8">
            {isLoading && <p className="text-slate-500 animate-pulse">Consultando inventario...</p>}
            {!isLoading && hotels.map((hotel) => (
              <HotelCard key={hotel.id} hotel={hotel} />
            ))}
          </div>
        </div>

        {/* Mock Cart Column */}
        <div className="md:col-span-1">
          <div className="sticky top-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-4 mb-4">
              Tu Reserva ({cartItems.length})
            </h2>
            
            {cartItems.length === 0 ? (
              <p className="text-sm text-slate-500">No hay habitaciones seleccionadas.</p>
            ) : (
              <div className="space-y-4">
                {cartItems.map((item) => (
                  <div key={item.id} className="group relative border-l-2 border-slate-900 pl-3">
                    <p className="text-xs font-medium text-slate-500">{item.hotelName}</p>
                    <p className="text-sm font-semibold text-slate-900">{item.roomName}</p>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="absolute right-0 top-1 text-xs text-red-500 opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                
                <div className="pt-4 border-t border-slate-100 mt-4">
                  <button className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800">
                    Proceder al Checkout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}