import type { GetServerSideProps } from 'next';
import type { Session } from 'next-auth';
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@apollo/client/react';
import { AdminLayout } from '../../features/auth/AdminLayout';
import { roleRedirect } from '../../features/auth/roleRedirect';
import { graphql } from '../../gql';
import { auth } from '../../server/auth';

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultRange() {
  const today = new Date();
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { fromDate: dateOnly(from), toDate: dateOnly(to) };
}

const ADMIN_BOOKING_METRICS_QUERY = graphql(`
  query AdminBookingMetrics($fromDate: Date, $toDate: Date) {
    adminBookingMetrics(fromDate: $fromDate, toDate: $toDate) {
      totalBookings
      pendingBookings
      confirmedBookings
      cancelledBookings
      failedBookings
      expiredBookings
      confirmedTotals {
        currency
        amount
      }
    }
  }
`);

function AdminMetricsPage() {
  const [range, setRange] = useState(defaultRange);
  const [draftRange, setDraftRange] = useState(range);
  const { data, loading, error } = useQuery(ADMIN_BOOKING_METRICS_QUERY, {
    variables: range,
    fetchPolicy: 'cache-and-network',
  });
  const metrics = data?.adminBookingMetrics;

  return (
    <AdminLayout>
      <Head><title>Métricas — Administración | Aleca Travel</title></Head>
      <section className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-sky-700">Operaciones</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Métricas de reservas</h2>
            <p className="mt-1 text-sm text-slate-600">Resumen por fecha de creación. Los importes se agrupan por moneda.</p>
          </div>
          <Link href="/admin" className="text-sm font-medium text-sky-700 hover:underline">Volver al resumen</Link>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const nextRange = {
              fromDate: String(values.get('fromDate') ?? ''),
              toDate: String(values.get('toDate') ?? ''),
            };
            setDraftRange(nextRange);
            setRange(nextRange);
          }}
          className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3"
          aria-label="Rango de métricas"
        >
          <label className="text-sm">Desde
            <input
              name="fromDate"
              type="date"
              required
              max={draftRange.toDate}
              value={draftRange.fromDate}
              onChange={(event) => setDraftRange((draft) => ({ ...draft, fromDate: event.target.value }))}
              className="mt-1 w-full rounded-md border p-2"
            />
          </label>
          <label className="text-sm">Hasta
            <input
              name="toDate"
              type="date"
              required
              min={draftRange.fromDate}
              value={draftRange.toDate}
              onChange={(event) => setDraftRange((draft) => ({ ...draft, toDate: event.target.value }))}
              className="mt-1 w-full rounded-md border p-2"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Actualizar
            </button>
          </div>
        </form>

        {loading && <p role="status" className="rounded-lg bg-white p-4 text-sm text-slate-600">Cargando métricas…</p>}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">No se pudieron cargar las métricas. Intenta de nuevo.</p>}

        {metrics && !error && (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Total de reservas', metrics.totalBookings],
                ['Pendientes', metrics.pendingBookings],
                ['Confirmadas', metrics.confirmedBookings],
                ['Canceladas', metrics.cancelledBookings],
                ['Fallidas', metrics.failedBookings],
                ['Expiradas', metrics.expiredBookings],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <dt className="text-sm text-slate-600">{label}</dt>
                  <dd className="mt-2 text-3xl font-semibold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Importe de reservas confirmadas</h3>
              <p className="mt-1 text-sm text-slate-600">No se mezclan monedas distintas en un total único.</p>
              {metrics.confirmedTotals.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">No hay reservas confirmadas en este periodo.</p>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {metrics.confirmedTotals.map(({ currency, amount }) => (
                    <li key={currency} className="rounded-lg bg-slate-50 p-4">
                      <p className="text-sm text-slate-600">{currency}</p>
                      <p className="mt-1 text-xl font-semibold">
                        {new Intl.NumberFormat('es-MX', {
                          style: 'currency',
                          currency,
                        }).format(Number(amount))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </section>
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

export default AdminMetricsPage;
