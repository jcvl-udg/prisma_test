import { useEffect, type ComponentType } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import type { UserRole } from '../../prisma/generated/client';

export function withRequireRole<P extends object>(
  Component: ComponentType<P>,
  roles: readonly UserRole[],
) {
  function RoleGuard(props: P) {
    const router = useRouter();
    const { data: session, status } = useSession();
    const user = session?.user;
    const authorized = !!user && roles.includes(user.role);

    useEffect(() => {
      if (status === 'unauthenticated') {
        void router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
      } else if (status === 'authenticated' && !authorized) {
        void router.replace('/');
      }
    }, [authorized, router, status]);

    if (status === 'loading' || !authorized) {
      return (
        <main className="mx-auto max-w-3xl p-6" aria-live="polite">
          <p className="text-gray-600">Verificando permisos…</p>
        </main>
      );
    }

    return <Component {...props} />;
  }

  RoleGuard.displayName = `withRequireRole(${Component.displayName ?? Component.name ?? 'Page'})`;
  return RoleGuard;
}
