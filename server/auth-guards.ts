import { GraphQLError } from 'graphql';
import type { UserRole } from '../prisma/generated/client';
import type { Context, SessionUser } from './context';

export function requireRole(
  ctx: Pick<Context, 'user'>,
  roles: readonly UserRole[],
): SessionUser {
  if (!ctx.user) {
    throw new GraphQLError('Debes iniciar sesión para realizar esta acción', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  if (!roles.includes(ctx.user.role)) {
    throw new GraphQLError('No tienes permisos para realizar esta acción', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  return ctx.user;
}
