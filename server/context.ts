import type { NextApiRequest } from 'next';
import type { NextApiResponse } from 'next';
import prisma from '../lib/prisma';
import { auth } from './auth';
import { sessionUserFromSession, type SessionUser } from './session-user';

export type { SessionUser } from './session-user';

// Se crea UNA vez por petición y llega a todos los resolvers como `ctx`.
// Usar ctx.prisma (en vez de importar prisma en cada módulo) facilita
// las pruebas: en un test puedes inyectar un cliente falso.
export interface Context {
  prisma: typeof prisma;
  user: SessionUser | null;
  anonymousId: string | null; // visitante sin cuenta (cookie)
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function createContext(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<Context> {
  const session = await auth(req, res);
  return {
    prisma,
    user: sessionUserFromSession(session),
    anonymousId: readCookie(req.headers.cookie, 'anonymousId'),
  };
}
