import type { ReactNode } from 'react';
import { withRequireRole } from './RequireRole';

function AdminContent({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Aleca Travel
        </p>
        <h1 className="text-2xl font-semibold">Panel de operaciones</h1>
      </header>
      {children}
    </main>
  );
}

export const AdminLayout = withRequireRole(AdminContent, ['ADMIN', 'AGENT']);
