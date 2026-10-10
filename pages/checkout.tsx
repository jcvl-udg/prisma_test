import { FormEvent, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useBooking } from '../features/booking/BookingContext';
import { useCreateQuote } from '../features/booking/useCreateQuote';
import { useCreateBooking } from '../features/booking/useCreateBooking';

import {
  toMs,
  formatMoney,
  formatCountdown,
  // isQuoteExpired, // opcional: usarlo en el cuerpo si querés
} from '../features/booking/checkout-utils';

export default function CheckoutPage() {
  const router = useRouter();
  const { selection, clear } = useBooking();
  const { createQuote, loading: quoting, error: quoteError } = useCreateQuote();
  // El hook recibe el quoteId como argumento: mientras no haya quote, pasamos undefined.
  const { createBooking, loading: bookingLoading, error: bookingError } =
    useCreateBooking(selection?.quoteId);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Guard: sin selección → /search
  useEffect(() => {
    if (!selection) router.replace('/search');
  }, [selection, router]);

  // Auto-cotizar al montar (si no hay quoteId todavía)
  useEffect(() => {
    if (!selection || selection.quoteId || quoting) return;
    void createQuote({
      hotelId: selection.hotelId,
      roomId: selection.roomId,
      checkIn: selection.checkIn,
      checkOut: selection.checkOut,
      adults: selection.adults,
      childrenAges: selection.childrenAges,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selection?.hotelId,
    selection?.roomId,
    selection?.checkIn,
    selection?.checkOut,
    selection?.adults,
    selection?.quoteId,
  ]);

  const expiresAtMs = toMs(selection?.expiresAt);
  const isExpired = expiresAtMs !== null && expiresAtMs <= now;

  const handleRequote = () => {
    if (!selection) return;
    void createQuote({
      hotelId: selection.hotelId,
      roomId: selection.roomId,
      checkIn: selection.checkIn,
      checkOut: selection.checkOut,
      adults: selection.adults,
      childrenAges: selection.childrenAges,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selection?.quoteId) return;

    // Firma real: createBooking(input) donde input son SOLO los datos del huésped.
    const result = await createBooking({
      guestName,
      guestEmail,
      guestPhone: guestPhone || undefined,
    });

    const reference = result.data?.createBooking.reference;
    if (reference) {
      clear();
      router.push(`/reservas/${reference}`);
    }
  };

  if (!selection) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-gray-600">Redirigiendo…</p>
      </main>
    );
  }

  const canConfirm =
    !!selection.quoteId &&
    !isExpired &&
    !bookingLoading &&
    guestName.trim().length > 0 &&
    guestEmail.trim().length > 0;

  return (
    <>
      <Head>
        <title>Checkout — Reservas</title>
      </Head>
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Confirmar reserva</h1>

        <section className="rounded border p-4 space-y-1">
          <h2 className="font-medium">Resumen</h2>
          <p>
            Hotel: <span className="font-mono">{selection.hotelId}</span>
          </p>
          <p>
            Habitación: <span className="font-mono">{selection.roomId}</span>
          </p>
          <p>
            Fechas: {selection.checkIn} → {selection.checkOut}
          </p>
          <p>
            Huéspedes: {selection.adults} adultos
            {selection.childrenAges.length > 0
              ? `, ${selection.childrenAges.length} menor(es)`
              : ''}
          </p>
          {selection.priceAmount != null && selection.currency && (
            <p className="text-lg font-semibold">
              Total: {formatMoney(selection.priceAmount, selection.currency)}
            </p>
          )}
        </section>

        {quoting && !selection.quoteId && (
          <p className="text-gray-600">Cotizando…</p>
        )}
        {quoteError && (
          <p className="text-red-600">Error al cotizar: {quoteError.message}</p>
        )}

        {selection.quoteId && expiresAtMs !== null && (
          <div
            className={`rounded border p-4 ${
              isExpired
                ? 'bg-red-50 border-red-300'
                : 'bg-blue-50 border-blue-200'
            }`}
          >
            {isExpired ? (
              <div className="flex items-center justify-between">
                <span className="text-red-700">La cotización expiró.</span>
                <button
                  type="button"
                  onClick={handleRequote}
                  disabled={quoting}
                  className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50"
                >
                  {quoting ? 'Cotizando…' : 'Volver a cotizar'}
                </button>
              </div>
            ) : (
              <span>
                La cotización expira en{' '}
                <strong>{formatCountdown(expiresAtMs - now)}</strong>
              </span>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">
              Nombre del huésped
            </label>
            <input
              required
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              required
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">
              Teléfono (opcional)
            </label>
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </div>

          {bookingError && (
            <p className="text-red-600">Error: {bookingError.message}</p>
          )}

          <button
            type="submit"
            disabled={!canConfirm}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {bookingLoading ? 'Confirmando…' : 'Confirmar reserva'}
          </button>
        </form>
      </main>
    </>
  );
}