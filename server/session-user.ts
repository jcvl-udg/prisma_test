import type { Session } from 'next-auth';
import { UserRole } from '../prisma/generated/client';

export interface SessionUser {
  id: string;
  role: UserRole;
}

export function sessionUserFromSession(session: Session | null): SessionUser | null {
  const user = session?.user;
  if (!user?.id || !Object.values(UserRole).includes(user.role)) return null;
  return { id: user.id, role: user.role };
}
