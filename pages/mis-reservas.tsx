import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@apollo/client/react';
import { auth } from '../server/auth';
import { roleRedirect } from '../features/auth/roleRedirect';
import { withRequireRole } from '../features/auth/RequireRole';
import { graphql } from '../gql';
import type { Session } from 'next-auth';

const MY_BOOKINGS_QUERY = graphql(`
  query MyBookings($first: Int, $skip: Int) {
    myBookings(first: $first, skip: $skip) {
      id
      reference
      status
      totalAmount
      currency
      createdAt
      items {
        checkIn
        checkOut
        hotel { title }
        room { name }
      }
    }
  }
`);

const PAGE_SIZE = 20;

function MyBookingsPage() {
  const [skip, setSkip] = useState(0);
  const { data, loading, error } = useQuery(MY_BOOKINGS_QUERY, {
    variables: { first: PAGE_SIZE, skip },
    fetchPolicy: 'cache-and-network',
  });
  const bookings = data?.myBookings ?? [];

  return (
    <>
      <Head><title>Mis reservas — Aleca Travel</title></Head>
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Mis reservas</h1>
          <p className="mt-1 text-sm text-slate-600">Consulta el estado y los detalles de tus viajes.</p>
        </header>
        {loading && <p role="status">Cargando reservas…</p>}
        {error && <p role="alert" className="text-red-700">No se pudieron cargar tus reservas. Inténtalo de nuevo.</p>}
        {!loading && !error && bookings.length === 0 && (
          <section className="rounded border bg-white p-6 text-center">
            <p>Aún no tienes reservas asociadas a tu cuenta.</p>
            <Link className="mt-3 inline-block underline" href="/search">Buscar hoteles</Link>
          </section>
        )}
        <ul className="space-y-4">
          {bookings.map((booking) => (
            <li key={booking.id} className="rounded border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link className="font-semibold underline" href={`/reservas/${booking.reference}`}>
                    Reserva {booking.reference}
                  </Link>
                  <p className="text-sm text-slate-600">{booking.status}</p>
                </div>
                <p className="font-semibold">
                  {new Intl.NumberFormat('es-MX', {
                    style: 'currency',
                    currency: booking.currency,
                  }).format(Number(booking.totalAmount))}
                </p>
              </div>
              <ul className="mt-3 space-y-2 border-t pt-3 text-sm text-slate-700">
                {booking.items.map((item) => (
                  <li key={`${item.checkIn}-${item.hotel.title}-${item.room.name}`}>
                    {item.hotel.title} · {item.room.name} · {item.checkIn} → {item.checkOut}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <nav aria-label="Paginación de reservas" className="flex justify-between">
          <button disabled={skip === 0 || loading} onClick={() => setSkip(Math.max(skip - PAGE_SIZE, 0))} className="rounded border px-3 py-2 disabled:opacity-40">
            Anterior
          </button>
          <button disabled={loading || bookings.length < PAGE_SIZE} onClick={() => setSkip(skip + PAGE_SIZE)} className="rounded border px-3 py-2 disabled:opacity-40">
            Siguiente
          </button>
        </nav>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<{ session: Session }> = async (context) => {
  const session = await auth(context);
  if (!session) {
    return {
      redirect: {
        destination: `/login?callbackUrl=${encodeURIComponent(context.resolvedUrl)}`,
        permanent: false,
      },
    };
  }
  const redirect = roleRedirect(session.user, ['CUSTOMER', 'AGENT', 'ADMIN']);
  if (redirect) return { redirect: { destination: redirect, permanent: false } };
  return { props: { session } };
};

export default withRequireRole(MyBookingsPage, ['CUSTOMER', 'AGENT', 'ADMIN']);
