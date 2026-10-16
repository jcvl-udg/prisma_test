import type { GetServerSideProps } from 'next';
import type { Session } from 'next-auth';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import type {
  AdminHotelsQueryVariables,
  AdminHotelStatus,
  HotelStatus,
} from '../../gql/graphql';
import { graphql } from '../../gql';
import { AdminLayout } from '../../features/auth/AdminLayout';
import { roleRedirect } from '../../features/auth/roleRedirect';
import { auth } from '../../server/auth';

const PAGE_SIZE = 20;
const STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;
type HotelStatusFilter = (typeof STATUSES)[number] | '';
type HotelSort = 'TITLE_ASC' | 'TITLE_DESC' | 'NEWEST';

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validStatus(value: string | undefined): value is AdminHotelStatus {
  return STATUSES.some((status) => status === value);
}

const ADMIN_HOTELS_QUERY = graphql(`
  query AdminHotels(
    $first: Int
    $last: Int
    $after: String
    $before: String
    $query: String
    $status: AdminHotelStatus
    $sort: AdminHotelSort
  ) {
    adminHotels(
      first: $first
      last: $last
      after: $after
      before: $before
      query: $query
      status: $status
      sort: $sort
    ) {
      edges {
        cursor
        node {
          id
          slug
          title
          status
          description
          categoryStars
          destination { name countryCode }
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

const CREATE_MANUAL_HOTEL = graphql(`
  mutation CreateAdminHotel(
    $title: String!
    $categoryStars: Int!
    $destinationName: String!
    $destinationCode: String
    $countryCode: String!
  ) {
    createManualHotel(
      title: $title
      categoryStars: $categoryStars
      destinationName: $destinationName
      destinationCode: $destinationCode
      countryCode: $countryCode
    ) {
      id
      title
    }
  }
`);

const UPDATE_ADMIN_HOTEL = graphql(`
  mutation UpdateAdminHotel(
    $id: String!
    $title: String
    $categoryStars: Int
    $status: HotelStatus
    $description: String
  ) {
    adminUpdateHotel(
      id: $id
      title: $title
      categoryStars: $categoryStars
      status: $status
      description: $description
    ) {
      id
      title
      status
      categoryStars
      description
    }
  }
`);

function AdminHotelsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'ADMIN';
  const [searchInput, setSearchInput] = useState('');
  const [statusInput, setStatusInput] = useState<HotelStatusFilter>('');
  const [sortInput, setSortInput] = useState<HotelSort>('TITLE_ASC');
  const [selectedHotel, setSelectedHotel] = useState<{
    id: string;
    title: string;
    categoryStars: number;
    status: string;
    description: string | null;
  } | null>(null);
  const [createError, setCreateError] = useState('');
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    setSearchInput(queryValue(router.query.q) ?? '');
    const status = queryValue(router.query.status);
    setStatusInput(validStatus(status) ? status : '');
    const selectedSort = queryValue(router.query.sort);
    setSortInput(
      selectedSort === 'TITLE_DESC' || selectedSort === 'NEWEST'
        ? selectedSort
        : 'TITLE_ASC',
    );
  }, [router.isReady, router.query]);

  const currentSearch = router.isReady ? queryValue(router.query.q)?.trim() ?? '' : '';
  const statusValue = queryValue(router.query.status);
  const currentStatus: AdminHotelStatus | undefined = router.isReady && validStatus(statusValue)
    ? statusValue
    : undefined;
  const after = router.isReady ? queryValue(router.query.after) : undefined;
  const before = router.isReady ? queryValue(router.query.before) : undefined;
  const sort = queryValue(router.query.sort) === 'TITLE_DESC'
    ? 'TITLE_DESC'
    : queryValue(router.query.sort) === 'NEWEST'
      ? 'NEWEST'
      : 'TITLE_ASC';
  const variables: AdminHotelsQueryVariables = {
    first: before ? null : PAGE_SIZE,
    last: before ? PAGE_SIZE : null,
    after: before ? null : after ?? null,
    before: before ?? null,
    query: currentSearch || null,
    status: currentStatus ?? null,
    sort,
  };
  const { data, loading, error } = useQuery(ADMIN_HOTELS_QUERY, {
    variables,
    skip: !router.isReady,
    fetchPolicy: 'cache-and-network',
  });
  const [createHotel, { loading: creating }] = useMutation(CREATE_MANUAL_HOTEL);
  const [updateHotel, { loading: updating }] = useMutation(UPDATE_ADMIN_HOTEL);
  const connection = data?.adminHotels;
  const hotels = connection?.edges?.flatMap(({ node }) => node ? [node] : []) ?? [];
  const baseQuery = useMemo(() => {
    const query: Record<string, string> = {};
    if (currentSearch) query.q = currentSearch;
    if (currentStatus) query.status = currentStatus;
    if (sort !== 'TITLE_ASC') query.sort = sort;
    return query;
  }, [currentSearch, currentStatus, sort]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query: Record<string, string> = {};
    const search = String(form.get('q') ?? '').trim();
    const status = String(form.get('status') ?? '');
    const selectedSort = String(form.get('sort') ?? 'TITLE_ASC');
    if (search) query.q = search;
    if (validStatus(status)) query.status = status;
    if (selectedSort !== 'TITLE_ASC') query.sort = selectedSort;
    void router.push({ pathname: '/admin/hoteles', query }, undefined, { shallow: true });
  };

  const goToPage = (direction: 'next' | 'previous') => {
    const cursor = direction === 'next'
      ? connection?.pageInfo?.endCursor
      : connection?.pageInfo?.startCursor;
    if (!cursor) return;
    const query = { ...baseQuery, [direction === 'next' ? 'after' : 'before']: cursor };
    void router.push({ pathname: '/admin/hoteles', query }, undefined, { shallow: true });
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await createHotel({
        variables: {
          title: String(form.get('title') ?? '').trim(),
          categoryStars: Number(form.get('categoryStars')),
          destinationName: String(form.get('destinationName') ?? '').trim(),
          destinationCode: String(form.get('destinationCode') ?? '').trim() || null,
          countryCode: String(form.get('countryCode') ?? '').trim().toUpperCase(),
        },
        refetchQueries: [{ query: ADMIN_HOTELS_QUERY, variables }],
        awaitRefetchQueries: true,
      });
      formElement.reset();
      setSearchInput('');
      setStatusInput('');
      void router.push('/admin/hoteles');
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'No se pudo crear el hotel.');
    }
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedHotel) return;
    setUpdateError('');
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    try {
      await updateHotel({
        variables: {
          id: selectedHotel.id,
          title,
          categoryStars: Number(form.get('categoryStars')),
          status: String(form.get('status')) as HotelStatus,
          description: description || null,
        },
        refetchQueries: [{ query: ADMIN_HOTELS_QUERY, variables }],
        awaitRefetchQueries: true,
      });
      setSelectedHotel(null);
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : 'No se pudo actualizar el hotel.');
    }
  };

  return (
    <AdminLayout>
      <Head><title>Hoteles — Administración | Aleca Travel</title></Head>
      <section className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-sky-700">Catálogo</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Gestión de hoteles</h2>
            <p className="mt-1 text-sm text-slate-600">Busca, actualiza y controla la publicación del catálogo.</p>
          </div>
          <Link href="/admin" className="text-sm font-medium text-sky-700 hover:underline">Volver al resumen</Link>
        </header>

        {isAdmin && (
          <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer font-semibold">Registrar hotel manual</summary>
            <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm">Nombre del hotel
                <input name="title" required maxLength={160} className="mt-1 w-full rounded-md border p-2" />
              </label>
              <label className="text-sm">Destino
                <input name="destinationName" required maxLength={120} className="mt-1 w-full rounded-md border p-2" />
              </label>
              <label className="text-sm">Código de destino (opcional)
                <input name="destinationCode" maxLength={5} className="mt-1 w-full rounded-md border p-2" />
              </label>
              <label className="text-sm">País (ISO 2 letras)
                <input name="countryCode" defaultValue="MX" required minLength={2} maxLength={2} className="mt-1 w-full rounded-md border p-2 uppercase" />
              </label>
              <label className="text-sm">Categoría
                <select name="categoryStars" defaultValue="3" className="mt-1 w-full rounded-md border p-2">
                  {[1, 2, 3, 4, 5].map((stars) => <option key={stars} value={stars}>{stars} estrellas</option>)}
                </select>
              </label>
              <div className="flex items-end">
                <button type="submit" disabled={creating} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {creating ? 'Creando…' : 'Crear hotel'}
                </button>
              </div>
            </form>
            {createError && <p role="alert" className="mt-3 text-sm text-red-700">{createError}</p>}
          </details>
        )}

        <form onSubmit={applyFilters} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros de hoteles">
          <label className="text-sm">Hotel o destino
            <input name="q" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="mt-1 w-full rounded-md border p-2" />
          </label>
          <label className="text-sm">Estado
            <select name="status" value={statusInput} onChange={(event) => setStatusInput(validStatus(event.target.value) ? event.target.value : '')} className="mt-1 w-full rounded-md border p-2">
              <option value="">Todos</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="text-sm">Orden
            <select name="sort" value={sortInput} onChange={(event) => setSortInput(
              event.target.value === 'TITLE_DESC' || event.target.value === 'NEWEST'
                ? event.target.value
                : 'TITLE_ASC',
            )} className="mt-1 w-full rounded-md border p-2">
              <option value="TITLE_ASC">Nombre A–Z</option>
              <option value="TITLE_DESC">Nombre Z–A</option>
              <option value="NEWEST">Más recientes</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Aplicar filtros</button>
          </div>
        </form>

        {selectedHotel && (
          <form onSubmit={handleUpdate} className="grid gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={`Editar ${selectedHotel.title}`}>
            <h3 className="font-semibold sm:col-span-2 lg:col-span-4">Editar {selectedHotel.title}</h3>
            <label className="text-sm">Nombre
              <input name="title" required maxLength={160} defaultValue={selectedHotel.title} className="mt-1 w-full rounded-md border p-2" />
            </label>
            <label className="text-sm">Categoría
              <select name="categoryStars" defaultValue={selectedHotel.categoryStars} className="mt-1 w-full rounded-md border p-2">
                {[1, 2, 3, 4, 5].map((stars) => <option key={stars} value={stars}>{stars} estrellas</option>)}
              </select>
            </label>
            <label className="text-sm">Estado de publicación
              <select name="status" defaultValue={selectedHotel.status} className="mt-1 w-full rounded-md border p-2">
                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className="text-sm">Descripción
              <textarea name="description" maxLength={5000} defaultValue={selectedHotel.description ?? ''} rows={2} className="mt-1 w-full rounded-md border p-2" />
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" disabled={updating} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {updating ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button type="button" onClick={() => setSelectedHotel(null)} className="rounded-md border px-4 py-2 text-sm">Cerrar</button>
            </div>
            {updateError && <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-4">{updateError}</p>}
          </form>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Resultados de hoteles">
          {loading && <p role="status" className="p-4 text-sm text-slate-600">Cargando hoteles…</p>}
          {error && <p role="alert" className="p-4 text-sm text-red-700">No se pudieron cargar los hoteles.</p>}
          {!loading && !error && hotels.length === 0 && <p className="p-6 text-center text-sm text-slate-600">No hay hoteles para estos filtros.</p>}
          {hotels.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                  <tr><th scope="col" className="px-4 py-3">Hotel</th><th scope="col" className="px-4 py-3">Destino</th><th scope="col" className="px-4 py-3">Categoría</th><th scope="col" className="px-4 py-3">Estado</th><th scope="col" className="px-4 py-3">Acciones</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hotels.map((hotel) => (
                    <tr key={hotel.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{hotel.title}</p>
                        <p className="text-xs text-slate-500">/{hotel.slug}</p>
                      </td>
                      <td className="px-4 py-3">{hotel.destination.name}, {hotel.destination.countryCode}</td>
                      <td className="px-4 py-3">{hotel.categoryStars} ★</td>
                      <td className="px-4 py-3">{hotel.status}</td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <button type="button" onClick={() => { setUpdateError(''); setSelectedHotel(hotel); }} className="font-medium text-sky-700 hover:underline">
                            Editar
                          </button>
                        ) : <span className="text-xs text-slate-500">Solo lectura</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <footer className="flex items-center justify-between border-t px-4 py-3">
            <button type="button" onClick={() => goToPage('previous')} disabled={!connection?.pageInfo?.hasPreviousPage || loading} className="rounded-md border px-3 py-2 text-sm disabled:opacity-40">Anterior</button>
            <span className="text-xs text-slate-500">Hasta {PAGE_SIZE} hoteles por página</span>
            <button type="button" onClick={() => goToPage('next')} disabled={!connection?.pageInfo?.hasNextPage || loading} className="rounded-md border px-3 py-2 text-sm disabled:opacity-40">Siguiente</button>
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

export default AdminHotelsPage;
