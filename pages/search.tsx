import { useState } from 'react';
import Head from 'next/head';
import { SearchBar } from '../components/SearchBar';
import { HotelCard } from '../components/HotelCard';
import { useCart } from '../context/CartContext';

import { gql } from "@apollo/client";
import { useMutation, useLazyQuery } from "@apollo/client/react";

// Tipos
interface Room {
  id: string;
  name: string;
}

interface Hotel {
  id: string;
  title: string;
  categoryStars: number;
  destination: { id: string; name: string; code: string | null };
  rooms: Room[];
}

interface BookingItemInput {
  hotelId: string;
  roomId: string;
}

interface CreateBookingVars {
  items: BookingItemInput[];
}

interface CreateBookingData {
  createBooking: {
    id: string;
    status: string;
  };
}

// Var's & Data 4 Search
interface SearchHotelsVars {
  query: string | null;
  take: number;
}

interface SearchHotelsData {
  searchHotels: Hotel[];
}

// mutations Use
const CREATE_BOOKING_MUTATION = gql`
  mutation CreateBooking($items: [BookingItemInput!]!) {
    createBooking(items: $items) {
      id
      status
    }
  }
`;

const FULL_SEARCH_QUERY = gql`
  query FullSearch($query: String, $take: Int) {
    searchHotels(query: $query, take: $take) {
      id
      title
      categoryStars
      destination { id name code }
      rooms { id name }
    }
  }
`;

export default function SearchPage() {
// Objcts
    const { items: cartItems, removeFromCart, clearCart } = useCart();

// Apollo Client Hooks (Reemplazan los useState locales)
  const [executeSearch, { data: searchData, loading: isSearching }] = useLazyQuery<
    SearchHotelsData,
    SearchHotelsVars
  >(FULL_SEARCH_QUERY, {
    fetchPolicy: 'network-only', // Garantiza disponibilidad en tiempo real
  });

  const [createBooking, { loading: isBooking }] = useMutation<
    CreateBookingData,
    CreateBookingVars
  >(CREATE_BOOKING_MUTATION);

// --- Handlers ---
  const handleSearch = (query: string) => {
    executeSearch({
      variables: { 
        query: query.trim() !== '' ? query.trim() : null, 
        take: 20 
      },
    });
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;

    try {
      const { data } = await createBooking({
        variables: {
          items: cartItems.map(item => ({
            hotelId: item.hotelId,
            roomId: item.roomId
          }))
        }
      });

      if (data?.createBooking) {
        alert(`¡Reserva confirmada! ID: ${data.createBooking.id} | Status: ${data.createBooking.status}`);
        clearCart();
      }
    } catch (error) {
      console.error('Error procesando checkout:', error);
      alert('Error al crear la reserva.');
    }
  };

  const hotels = searchData?.searchHotels || [];

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
            onSelect={handleSearch} 
          />

          <div className="space-y-4 mt-8">
            {isSearching && <p className="text-slate-500 animate-pulse">Consultando inventario...</p>}
            {!isSearching && hotels.length === 0 && searchData && (
              <p className="text-slate-500">No se encontraron hoteles para esta búsqueda.</p>
            )}
            {!isSearching && hotels.map((hotel) => (
              <HotelCard key={hotel.id} hotel={hotel} />
            ))}
          </div>
        </div>

        {/* Checkout Cart Column */}
        <div className="md:col-span-1">
          <div className="sticky top-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Tu Reserva ({cartItems.length})
              </h2>
              {cartItems.length > 0 && (
                <button 
                  onClick={clearCart}
                  className="text-xs font-medium text-slate-400 hover:text-red-600 transition-colors"
                >
                  Vaciar
                </button>
              )}
            </div>
            
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
                
                <div className="pt-4 border-t border-slate-100 mt-4 space-y-2">
                  <button 
                    onClick={handleCheckout}
                    disabled={isBooking}
                    className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isBooking ? 'Procesando...' : 'Proceder al Checkout'}
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