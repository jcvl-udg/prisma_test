import type { GetServerSideProps } from 'next';
import type { Session } from 'next-auth';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { graphql } from '../../../gql';
import { AdminLayout } from '../../../features/auth/AdminLayout';
import { roleRedirect } from '../../../features/auth/roleRedirect';
import { auth } from '../../../server/auth';

const ADMIN_BOOKING_DETAIL_QUERY = graphql(`
  query AdminBookingDetail($id: String!) {
    adminBookingById(id: $id) {
      id
      reference
      status
      guestName
      guestEmail
      guestPhone
      totalAmount
      currency
      createdAt
      confirmedAt
      cancelledAt
      expiresAt
      items {
        id
        status
        checkIn
        checkOut
        adults
        childrenAges
        priceAmount
        currency
        providerBookingRef
        hotel { id slug title categoryStars }
        room { id name }
        provider { code name }
      }
      events {
        id
        type
        createdAt
        payload
      }
    }
  }
`);

const TRANSITION_ADMIN_BOOKING_MUTATION = graphql(`
  mutation TransitionAdminBooking(
    $id: String!
    $transition: AdminBookingTransition!
    $reason: String
  ) {
    transitionAdminBooking(id: $id, transition: $transition, reason: $reason) {
      id
      status
    }
  }
`);

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(
    Number(amount),
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function AdminBookingDetailPage() {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [transitionError, setTransitionError] = useState('');
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const { data, loading, error } = useQuery(ADMIN_BOOKING_DETAIL_QUERY, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'network-only',
  });
  const [transitionBooking, { loading: transitioning }] = useMutation(
    TRANSITION_ADMIN_BOOKING_MUTATION,
  );
  const booking = data?.adminBookingById;

  const runTransition = async (transition: 'CONFIRM' | 'CANCEL') => {
    if (transition === 'CANCEL' && !window.confirm('¿Cancelar esta reserva confirmada?')) {
      return;
    }

    setTransitionError('');
    try {
      await transitionBooking({
        variables: {
          id,
          transition,
          reason: transition === 'CANCEL' ? reason.trim() || null : null,
        },
        refetchQueries: [
          { query: ADMIN_BOOKING_DETAIL_QUERY, variables: { id } },
        ],
        awaitRefetchQueries: true,
      });
      setReason('');
    } catch (cause) {
      setTransitionError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo actualizar el estado de la reserva.',
      );
    }
  };

  return (
    <AdminLayout>
      <Head>
        <title>{booking ? `Reserva ${booking.reference}` : 'Detalle de reserva'} — Administración</title>
      </Head>
      <div className="space-y-5">
        <Link href="/admin/reservas" className="text-sm font-medium text-sky-700 hover:underline">
          ← Volver a reservas
        </Link>
        {loading && <p role="status" className="rounded-lg bg-white p-5">Cargando detalle…</p>}
        {error && <p role="alert" className="rounded-lg bg-white p-5 text-red-700">No se pudo cargar la reserva.</p>}
        {!loading && !error && !booking && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Reserva no encontrada</h2>
            <p className="mt-2 text-sm text-slate-600">
              La reserva no existe o ya no está disponible.
            </p>
          </section>
        )}
        {booking && (
          <>
            <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-sky-700">Detalle de reserva</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">{booking.reference}</h2>
                <p className="mt-1 text-sm text-slate-600">Creada {formatDate(booking.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{booking.status}</span>
                {booking.status === 'PENDING' && (
                  <button
                    type="button"
                    disabled={transitioning}
                    onClick={() => void runTransition('CONFIRM')}
                    className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    {transitioning ? 'Procesando…' : 'Confirmar reserva'}
                  </button>
                )}
                {booking.status === 'CONFIRMED' && (
                  <div className="flex flex-col items-end gap-2">
                    <label className="text-left text-xs text-slate-600">
                      Motivo de cancelación (opcional)
                      <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={2}
                        maxLength={500}
                        className="mt-1 block w-64 rounded-md border border-slate-300 p-2 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={transitioning}
                      onClick={() => void runTransition('CANCEL')}
                      className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      {transitioning ? 'Procesando…' : 'Cancelar reserva'}
                    </button>
                  </div>
                )}
              </div>
            </header>
            {transitionError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {transitionError}
              </p>
            )}

            <section className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Huésped</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div><dt className="inline text-slate-500">Nombre: </dt><dd className="inline font-medium">{booking.guestName}</dd></div>
                  <div><dt className="inline text-slate-500">Email: </dt><dd className="inline">{booking.guestEmail}</dd></div>
                  {booking.guestPhone && <div><dt className="inline text-slate-500">Teléfono: </dt><dd className="inline">{booking.guestPhone}</dd></div>}
                </dl>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Resumen de pago y estado</h3>
                <p className="mt-3 text-2xl font-semibold">{formatMoney(booking.totalAmount, booking.currency)}</p>
                <dl className="mt-3 space-y-2 text-sm text-slate-600">
                  <div>Confirmada: {booking.confirmedAt ? formatDate(booking.confirmedAt) : '—'}</div>
                  <div>Cancelada: {booking.cancelledAt ? formatDate(booking.cancelledAt) : '—'}</div>
                  <div>Vence: {booking.expiresAt ? formatDate(booking.expiresAt) : '—'}</div>
                </dl>
              </article>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Alojamientos</h3>
              {booking.items.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">Esta reserva no tiene ítems asociados.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {booking.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                      <div>
                        <Link href={`/search?hotelSlug=${encodeURIComponent(item.hotel.slug)}`} className="font-medium text-sky-700 hover:underline">
                          {item.hotel.title}
                        </Link>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.room.name} · {item.checkIn} → {item.checkOut}
                        </p>
                        <p className="text-sm text-slate-500">
                          {item.adults} adulto(s)
                          {item.childrenAges.length > 0 ? ` · ${item.childrenAges.length} menor(es)` : ''}
                          {' · '}{item.provider.name} ({item.provider.code})
                        </p>
                        {item.providerBookingRef && (
                          <p className="mt-1 text-xs text-slate-500">
                            Localizador proveedor: {item.providerBookingRef}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{item.status}</span>
                        <p className="mt-2 text-sm font-semibold">{formatMoney(item.priceAmount, item.currency)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Timeline de actividad</h3>
              {booking.events.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">No hay eventos registrados.</p>
              ) : (
                <ol className="mt-4 space-y-4">
                  {booking.events.map((event) => (
                    <li key={event.id} className="flex gap-3">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{event.type}</p>
                        <p className="text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                        {event.payload && (
                          <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-600">{event.payload}</pre>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
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
  const redirect = roleRedirect(session.user, ['ADMIN', 'AGENT']);
  if (redirect) return { redirect: { destination: redirect, permanent: false } };
  return { props: { session } };
};

export default AdminBookingDetailPage;
