import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from 'next-auth/react';
import { withRequireRole } from './RequireRole';

function AdminContent({ children }: { children: ReactNode }) {
  const router = useRouter();

  const isActive = (href: string) =>
    router.pathname === href ||
    (href !== '/admin' && router.pathname.startsWith(`${href}/`));

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <aside className="flex w-full flex-col border-b border-slate-200 bg-white p-4 md:min-h-screen md:w-64 md:border-b-0 md:border-r md:p-6">
        <Link href="/admin" className="text-lg font-bold text-slate-900">
          Aleca Travel
        </Link>
        <p className="mt-1 text-sm text-slate-500">Panel de operaciones</p>

        <nav aria-label="Navegación de administración" className="mt-6 flex-1">
          <ul className="flex gap-2 overflow-x-auto md:flex-col">
            <li>
              <Link
                href="/admin"
                aria-current={isActive('/admin') ? 'page' : undefined}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive('/admin')
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Resumen
              </Link>
            </li>
            <li>
              <Link
                href="/admin/reservas"
                aria-current={isActive('/admin/reservas') ? 'page' : undefined}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive('/admin/reservas')
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Reservas
              </Link>
            </li>
            {[
              { href: '/admin/hoteles', label: 'Hoteles' },
              { href: '/admin/metricas', label: 'Métricas' },
            ].map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? 'page' : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive(href)
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <button
          type="button"
          onClick={() => void signOut({ redirectTo: '/' })}
          className="mt-6 rounded-lg border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-5 py-4 md:px-8">
          <h1 className="text-xl font-semibold text-slate-900">
            Panel de operaciones
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestión para agentes y administradores
          </p>
        </header>
        <main className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export const AdminLayout = withRequireRole(AdminContent, ['ADMIN', 'AGENT']);
