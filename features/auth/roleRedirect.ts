import type { UserRole } from '../../prisma/generated/client';

export function roleRedirect(
  user: { role: UserRole } | null,
  roles: readonly UserRole[],
): string | null {
  if (!user) return '/login';
  return roles.includes(user.role) ? null : '/';
}
