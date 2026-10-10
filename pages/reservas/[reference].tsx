import Head from 'next/head';
import Link from 'next/link';
import { GetServerSideProps } from 'next';
import prisma from '../../lib/prisma';
import {
  loadBookingByReference,
  type BookingPageDTO,
  type BookingPageEvent,
} from '../../features/booking/server/loadBookingByReference';

export const getServerSideProps: GetServerSideProps<{
  booking: BookingPageDTO;
}> = async (ctx) => {
  const reference = String(ctx.params?.reference ?? '');
  const booking = await loadBookingByReference(prisma, reference);
  if (!booking) return { notFound: true };
  return { props: { booking } };
};

const statusStyles: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  FAILED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-800',
};

function formatMoney(amount: string, currency: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function payloadToText(payload: unknown): string | null {
  if (payload == null) return null;
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return null;
  }
}

function EventRow({ ev }: { ev: BookingPageEvent }) {
  const text = payloadToText(ev.payload);
  return (
    <li className="flex gap-3">
      <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-black" />
      <div className="min-w-0">
        <p className="font-medium">{ev.type}</p>
        <p className="text-xs text-gray-500">
          {new Date(ev.createdAt).toLocaleString('es-MX')}
        </p>
        {text && (
          <pre className="mt-1 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-500">
            {text}
          </pre>
        )}
      </div>
    </li>
  );
}

export default function BookingPage({ booking }: { booking: BookingPageDTO }) {
  // En Fase A hay un solo item por booking; tomamos su rango de fechas como el de la reserva.
  const firstItem = booking.items[0];
  const stayLabel = firstItem
    ? `${firstItem.checkIn} → ${firstItem.checkOut}`
    : '—';

  return (
    <>
      <Head>
        <title>Reserva {booking.reference} — Reservas</title>
      </Head>
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            Reserva {booking.reference}
          </h1>
          <span
            className={`rounded px-3 py-1 text-sm font-medium ${
              statusStyles[booking.status] ?? 'bg-gray-100 text-gray-800'
            }`}
          >
            {booking.status}
          </span>
        </div>

        <section className="rounded border p-4 space-y-1">
          <h2 className="font-medium">Huésped</h2>
          <p>{booking.guestName}</p>
          <p className="text-sm text-gray-600">{booking.guestEmail}</p>
          {booking.guestPhone && (
            <p className="text-sm text-gray-600">{booking.guestPhone}</p>
          )}
        </section>

        <section className="rounded border p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Estadía</h2>
            <span className="text-sm text-gray-600">{stayLabel}</span>
          </div>
          {booking.items.length === 0 ? (
            <p className="text-sm text-gray-500">Sin ítems.</p>
          ) : (
            <ul className="divide-y">
              {booking.items.map((it) => (
                <li key={it.id} className="flex justify-between py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{it.hotelTitle}</p>
                    <p className="text-sm text-gray-600">
                      {it.roomName} · {it.checkIn} → {it.checkOut} ·{' '}
                      {it.adults} adulto(s)
                      {it.childrenAges.length > 0
                        ? `, ${it.childrenAges.length} menor(es)`
                        : ''}
                    </p>
                    <p className="text-xs text-gray-500">{it.status}</p>
                  </div>
                  <span className="font-mono whitespace-nowrap">
                    {formatMoney(it.priceAmount, it.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span>{formatMoney(booking.totalAmount, booking.currency)}</span>
          </div>
        </section>

        <section className="rounded border p-4 space-y-3">
          <h2 className="font-medium">Historial</h2>
          {booking.events.length === 0 ? (
            <p className="text-sm text-gray-500">Sin eventos registrados.</p>
          ) : (
            <ol className="space-y-3">
              {booking.events.map((ev) => (
                <EventRow key={ev.id} ev={ev} />
              ))}
            </ol>
          )}
        </section>

        <Link href="/search" className="text-sm underline">
          Volver a buscar
        </Link>
      </main>
    </>
  );
}