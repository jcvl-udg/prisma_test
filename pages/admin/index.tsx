import type { GetServerSideProps } from 'next';
import type { Session } from 'next-auth';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@apollo/client/react';
import { AdminLayout } from '../../features/auth/AdminLayout';
import { roleRedirect } from '../../features/auth/roleRedirect';
import { graphql } from '../../gql';
import { auth } from '../../server/auth';

const ADMIN_BOOKINGS_QUERY = graphql(`
  query AdminBookings($first: Int, $skip: Int) {
    adminBookings(first: $first, skip: $skip) {
      id
      reference
      status
      totalAmount
      currency
      createdAt
    }
  }
`);

function AdminDashboard() {
  const { data, loading, error } = useQuery(ADMIN_BOOKINGS_QUERY, {
    variables: { first: 20, skip: 0 },
    fetchPolicy: 'cache-and-network',
  });
  const bookings = data?.adminBookings ?? [];

  return (
    <AdminLayout>
      <Head><title>Administración — Aleca Travel</title></Head>
      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Reservas recientes</h2>
            <p className="text-sm text-slate-600">Vista operativa para agentes y administradores.</p>
          </div>
          <Link href="/mis-reservas" className="text-sm underline">Mis reservas</Link>
        </div>
        {loading && <p role="status" className="mt-4">Cargando…</p>}
        {error && <p role="alert" className="mt-4 text-red-700">No se pudieron cargar las reservas.</p>}
        {!loading && !error && bookings.length === 0 && <p className="mt-4">No hay reservas registradas.</p>}
        {bookings.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b"><th className="p-2">Referencia</th><th className="p-2">Estado</th><th className="p-2">Total</th><th className="p-2">Creada</th></tr></thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id} className="border-b last:border-0">
                    <td className="p-2"><Link className="underline" href={`/reservas/${booking.reference}`}>{booking.reference}</Link></td>
                    <td className="p-2">{booking.status}</td>
                    <td className="p-2">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: booking.currency }).format(Number(booking.totalAmount))}</td>
                    <td className="p-2">{new Date(booking.createdAt).toLocaleDateString('es-MX')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

export default AdminDashboard;
