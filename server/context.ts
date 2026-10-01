import type { NextApiRequest } from 'next';
import prisma from '../lib/prisma';

// Usuario autenticado. Hoy siempre es null; en la Tarea 3 (autenticación)
// se llena leyendo la sesión de la librería elegida.
export interface SessionUser {
  id: string;
  role: 'CUSTOMER' | 'AGENT' | 'ADMIN';
}

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

export function createContext(req: NextApiRequest): Context {
  return {
    prisma,
    user: null, // TODO(Tarea 3): resolver sesión
    anonymousId: readCookie(req.headers.cookie, 'anonymousId'),
  };
}
