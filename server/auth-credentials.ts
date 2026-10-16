import type { PrismaClient } from '../prisma/generated/client';
import prisma from '../lib/prisma';
import { normalizeEmail } from '../lib/text';
import { verifyPassword } from './password';

export async function authorizeCredentials(
  credentials: Partial<Record<'email' | 'password', unknown>>,
  client: PrismaClient = prisma,
) {
  const email =
    typeof credentials.email === 'string' ? normalizeEmail(credentials.email) : '';
  const password =
    typeof credentials.password === 'string' ? credentials.password : '';
  if (!email || !password) return null;

  const user = await client.user.findUnique({ where: { email } });
  if (!user?.password || !(await verifyPassword(password, user.password))) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
  };
}
