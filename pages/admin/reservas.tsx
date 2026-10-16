import type { GetServerSideProps } from 'next';
import type { Session } from 'next-auth';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@apollo/client/react';
import type { AdminBookingsPageQueryVariables } from '../../gql/graphql';
import { graphql } from '../../gql';
import { AdminLayout } from '../../features/auth/AdminLayout';
import { roleRedirect } from '../../features/auth/roleRedirect';
import { auth } from '../../server/auth';

const PAGE_SIZE = 20;
const STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED', 'EXPIRED'] as const;
const SORTS = ['CREATED_DESC', 'CREATED_ASC', 'TOTAL_DESC', 'TOTAL_ASC'] as const;

type BookingStatus = (typeof STATUSES)[number];
type BookingSort = (typeof SORTS)[number];
type FilterValues = {
  status: BookingStatus | '';
  fromDate: string;
  toDate: string;
  guestEmail: string;
  providerCode: string;
  sort: BookingSort;
};

const DEFAULT_FILTERS: FilterValues = {
  status: '',
  fromDate: '',
  toDate: '',
  guestEmail: '',
  providerCode: '',
  sort: 'CREATED_DESC',
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isDateOnly(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function readFilters(query: Record<string, string | string[] | undefined>): FilterValues {
  const status = STATUSES.find((candidate) => candidate === firstQueryValue(query.status));
  const sort = SORTS.find((candidate) => candidate === firstQueryValue(query.sort));
  const fromDate = firstQueryValue(query.fromDate);
  const toDate = firstQueryValue(query.toDate);
  return {
    status: status ?? '',
    fromDate: isDateOnly(fromDate) ? fromDate : '',
    toDate: isDateOnly(toDate) ? toDate : '',
    guestEmail: firstQueryValue(query.guestEmail) ?? '',
    providerCode: firstQueryValue(query.providerCode) ?? '',
    sort: sort ?? 'CREATED_DESC',
  };
}

function filtersToQuery(filters: FilterValues): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.status) query.status = filters.status;
  if (filters.fromDate) query.fromDate = filters.fromDate;
  if (filters.toDate) query.toDate = filters.toDate;
  if (filters.guestEmail.trim()) query.guestEmail = filters.guestEmail.trim();
  if (filters.providerCode.trim()) query.providerCode = filters.providerCode.trim();
  if (filters.sort !== 'CREATED_DESC') query.sort = filters.sort;
  return query;
}

function readCursor(query: Record<string, string | string[] | undefined>) {
  return {
    after: firstQueryValue(query.after),
    before: firstQueryValue(query.before),
  };
}

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

const ADMIN_BOOKINGS_QUERY = graphql(`
  query AdminBookingsPage(
    $first: Int
    $last: Int
    $after: String
    $before: String
    $status: AdminBookingStatus
    $fromDate: Date
    $toDate: Date
    $guestEmail: String
    $providerCode: String
    $sort: AdminBookingSort
  ) {
    adminBookings(
      first: $first
      last: $last
      after: $after
      before: $before
      status: $status
      fromDate: $fromDate
      toDate: $toDate
      guestEmail: $guestEmail
      providerCode: $providerCode
      sort: $sort
    ) {
      edges {
        cursor
        node {
          id
          reference
          status
          totalAmount
          currency
          createdAt
        }
      }
      pageInfo {
        startCursor
        endCursor
        hasNextPage
        hasPreviousPage
      }
    }
  }
`);

function AdminBookingsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  useEffect(() => {
    if (router.isReady) setFilters(readFilters(router.query));
  }, [router.isReady, router.query]);

  const currentFilters = useMemo(
    () => (router.isReady ? readFilters(router.query) : DEFAULT_FILTERS),
    [router.isReady, router.query],
  );
  const cursor = router.isReady ? readCursor(router.query) : { after: undefined, before: undefined };
  const variables: AdminBookingsPageQueryVariables = {
    first: cursor.before ? null : PAGE_SIZE,
    last: cursor.before ? PAGE_SIZE : null,
    after: cursor.before ? null : cursor.after ?? null,
    before: cursor.before ?? null,
    status: currentFilters.status || null,
    fromDate: currentFilters.fromDate || null,
    toDate: currentFilters.toDate || null,
    guestEmail: currentFilters.guestEmail.trim() || null,
    providerCode: currentFilters.providerCode.trim() || null,
    sort: currentFilters.sort,
  };

  const { data, loading, error } = useQuery(ADMIN_BOOKINGS_QUERY, {
    variables,
    skip: !router.isReady,
    fetchPolicy: 'cache-and-network',
  });
  const connection = data?.adminBookings;
  const bookings = connection?.edges?.flatMap(({ node }) => node ? [node] : []) ?? [];

  const pushQuery = (query: Record<string, string>) => {
    void router.push(
      { pathname: '/admin/reservas', query },
      undefined,
      { shallow: true },
    );
  };

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const next: Record<string, string> = {};

    for (const key of ['status', 'fromDate', 'toDate', 'guestEmail', 'providerCode', 'sort']) {
      const value = String(formData.get(key) ?? '').trim();
      if (value && !(key === 'sort' && value === 'CREATED_DESC')) next[key] = value;
    }
    pushQuery(next);
  };

  const nextPage = () => {
    if (!connection?.pageInfo.endCursor) return;
    const query = filtersToQuery(currentFilters);
    query.after = connection.pageInfo.endCursor;
    pushQuery(query);
  };

  const previousPage = () => {
    if (!connection?.pageInfo.startCursor) return;
    const query = filtersToQuery(currentFilters);
    query.before = connection.pageInfo.startCursor;
    pushQuery(query);
  };

  const clearFilters = () => pushQuery({});

  return (
    <AdminLayout>
      <Head>
        <title>Reservas — Administración | Aleca Travel</title>
      </Head>
      <section className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-sky-700">
              Operaciones
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Reservas</h2>
            <p className="mt-1 text-sm text-slate-600">
              Filtra y revisa las reservas de la agencia.
            </p>
          </div>
          <Link href="/admin" className="text-sm font-medium text-sky-700 hover:underline">
            Volver al resumen
          </Link>
        </header>

        <form
          onSubmit={submitFilters}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Filtros de reservas"
        >
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Estado
            <select name="status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: STATUSES.find((status) => status === event.target.value) ?? '' })} className="w-full rounded-md border border-slate-300 p-2">
              <option value="">Todos</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Desde
            <input name="fromDate" type="date" max={filters.toDate || undefined} value={filters.fromDate} onChange={(event) => setFilters({ ...filters, fromDate: event.target.value })} className="w-full rounded-md border border-slate-300 p-2" />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Hasta
            <input name="toDate" type="date" min={filters.fromDate || undefined} value={filters.toDate} onChange={(event) => setFilters({ ...filters, toDate: event.target.value })} className="w-full rounded-md border border-slate-300 p-2" />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Email del huésped
            <input name="guestEmail" type="email" value={filters.guestEmail} onChange={(event) => setFilters({ ...filters, guestEmail: event.target.value })} placeholder="cliente@correo.com" className="w-full rounded-md border border-slate-300 p-2" />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Proveedor
            <input name="providerCode" value={filters.providerCode} onChange={(event) => setFilters({ ...filters, providerCode: event.target.value })} placeholder="LOCAL" className="w-full rounded-md border border-slate-300 p-2" />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Ordenar por
            <select name="sort" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: SORTS.find((sort) => sort === event.target.value) ?? 'CREATED_DESC' })} className="w-full rounded-md border border-slate-300 p-2">
              <option value="CREATED_DESC">Más recientes</option>
              <option value="CREATED_ASC">Más antiguas</option>
              <option value="TOTAL_DESC">Total: mayor a menor</option>
              <option value="TOTAL_ASC">Total: menor a mayor</option>
            </select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              Aplicar filtros
            </button>
            <button type="button" onClick={clearFilters} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Limpiar
            </button>
          </div>
        </form>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Resultados de reservas">
          {loading && <p role="status" className="p-4 text-sm text-slate-600">Cargando reservas…</p>}
          {error && <p role="alert" className="p-4 text-sm text-red-700">No se pudieron cargar las reservas. Intenta de nuevo.</p>}
          {!loading && !error && bookings.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-600">No hay reservas que coincidan con estos filtros.</p>
          )}
          {bookings.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">Referencia</th>
                    <th scope="col" className="px-4 py-3">Estado</th>
                    <th scope="col" className="px-4 py-3">Total</th>
                    <th scope="col" className="px-4 py-3">Creada</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{booking.reference}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{booking.status}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{formatMoney(booking.totalAmount, booking.currency)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(booking.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link href={`/admin/reservas/${booking.id}`} className="font-medium text-sky-700 hover:underline">
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={previousPage}
              disabled={!connection?.pageInfo?.hasPreviousPage || loading}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">Máximo {PAGE_SIZE} reservas por página</span>
            <button
              type="button"
              onClick={nextPage}
              disabled={!connection?.pageInfo?.hasNextPage || loading}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
            </button>
          </footer>
        </section>
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

export default AdminBookingsPage;
