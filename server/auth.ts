import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import Nodemailer from 'next-auth/providers/nodemailer';
import NextAuth from 'next-auth';
import type { UserRole } from '../prisma/generated/client';
import nodemailer from 'nodemailer';
import prisma from '../lib/prisma';
import { authorizeCredentials } from './auth-credentials';

const isProduction = process.env.NODE_ENV === 'production';
const configuredEmailServer = process.env.EMAIL_SERVER?.trim() || undefined;
const emailServer: string | { jsonTransport: true } =
  configuredEmailServer ?? { jsonTransport: true };

const emailFrom = process.env.EMAIL_FROM ?? 'Aleca Travel <no-reply@aleca.local>';

function isUserRole(value: unknown): value is UserRole {
  return value === 'CUSTOMER' || value === 'AGENT' || value === 'ADMIN';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Correo electrónico', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      authorize: (credentials) => authorizeCredentials(credentials),
    }),
    Nodemailer({
      server: emailServer,
      from: emailFrom,
      async sendVerificationRequest({ identifier, url, provider }) {
        if (isProduction && !configuredEmailServer) {
          throw new Error('EMAIL_SERVER es obligatorio para enviar magic links');
        }
        const transport = nodemailer.createTransport(provider.server);
        await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: 'Inicia sesión en Aleca Travel',
          text: `Usa este enlace para iniciar sesión: ${url}`,
          html: `<p>Usa este enlace para iniciar sesión:</p><p><a href="${url}">Iniciar sesión</a></p>`,
        });

        if (!isProduction) {
          console.info(`🔗 Magic link para ${identifier}: ${url}`);
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (
        !session.user ||
        typeof token.id !== 'string' ||
        !isUserRole(token.role)
      ) {
        throw new Error('El token de sesión no contiene una identidad y un rol válidos');
      }
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
