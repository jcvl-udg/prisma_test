import { afterAll, describe, expect, it } from 'vitest';
import { createYoga } from 'graphql-yoga';
import type { Session } from 'next-auth';
import type { Context, SessionUser } from '../server/context';
import { sessionUserFromSession } from '../server/session-user';
import { authorizeCredentials } from '../server/auth-credentials';
import { requireRole } from '../server/auth-guards';
import { roleRedirect } from '../features/auth/roleRedirect';
import { hashPassword, isValidPassword, verifyPassword } from '../server/password';
import { schema } from '../server/schema';
import { testPrisma, disconnectTestDb } from './helpers/db';

let currentUser: SessionUser | null = null;

const yoga = createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  logging: false,
  maskedErrors: false,
  context: () =>
    ({
      prisma: testPrisma,
      user: currentUser,
      anonymousId: null,
    }) as unknown as Context,
});

type GraphQLErrorResult = {
  message: string;
  extensions?: { code?: string };
};

async function gql<TData>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data?: TData; errors?: GraphQLErrorResult[] }> {
  const response = await yoga.fetch('http://test/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return response.json() as Promise<{ data?: TData; errors?: GraphQLErrorResult[] }>;
}

const SIGNUP = /* GraphQL */ `
  mutation Signup($name: String, $email: String!, $password: String!) {
    signupUser(name: $name, email: $email, password: $password) {
      id
      email
      name
      role
    }
  }
`;

const ME = /* GraphQL */ `
  query Me {
    me {
      id
      email
      role
    }
  }
`;

describe('autenticación', () => {
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('hashea y verifica contraseñas sin guardar el texto original', async () => {
    const password = 'correct-password-123';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('wrong-password-123', hash)).toBe(false);
    expect(await verifyPassword('corta', hash)).toBe(false);
    expect(isValidPassword('á'.repeat(37))).toBe(false);
  });

  it('crea usuarios como CUSTOMER con correo normalizado y hash', async () => {
    const email = ` Auth.Test.${crypto.randomUUID()}@Example.COM `;
    let userId: string | undefined;
    try {
      const result = await gql<{
        signupUser: { id: string; email: string; name: string; role: string };
      }>(SIGNUP, { name: '  Usuario de prueba  ', email, password: 'valid-pass-123' });

      expect(result.errors).toBeUndefined();
      const created = result.data!.signupUser;
      userId = created.id;
      expect(created.email).toBe(email.trim().toLowerCase());
      expect(created.name).toBe('Usuario de prueba');
      expect(created.role).toBe('CUSTOMER');

      const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(stored.password).not.toBe('valid-pass-123');
      expect(await verifyPassword('valid-pass-123', stored.password!)).toBe(true);

      const duplicate = await gql(SIGNUP, {
        name: 'Otro nombre',
        email: email.trim().toLowerCase(),
        password: 'valid-pass-456',
      });
      expect(duplicate.errors?.[0].extensions?.code).toBe('CONFLICT');
    } finally {
      if (userId) await testPrisma.user.delete({ where: { id: userId } });
    }
  });

  it('rechaza correo inválido y contraseñas fuera del límite', async () => {
    const invalidEmail = await gql(SIGNUP, {
      name: null,
      email: 'not-an-email',
      password: 'valid-pass-123',
    });
    expect(invalidEmail.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');

    const invalidPassword = await gql(SIGNUP, {
      name: null,
      email: `valid.${crypto.randomUUID()}@example.test`,
      password: 'short',
    });
    expect(invalidPassword.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('autoriza credenciales con email normalizado y rechaza credenciales incorrectas', async () => {
    const email = `credential.${crypto.randomUUID()}@example.test`;
    const hash = await hashPassword('seed-password-123');
    const user = await testPrisma.user.create({
      data: { email, password: hash, name: 'Cuenta de prueba', role: 'AGENT' },
    });

    try {
      const authenticated = await authorizeCredentials(
        { email: ` ${email.toUpperCase()} `, password: 'seed-password-123' },
        testPrisma,
      );
      expect(authenticated?.id).toBe(user.id);
      expect(authenticated?.role).toBe('AGENT');

      await expect(
        authorizeCredentials({ email, password: 'bad-password-123' }, testPrisma),
      ).resolves.toBeNull();
      await expect(
        authorizeCredentials({ email: 'absent@example.test', password: 'any-password' }, testPrisma),
      ).resolves.toBeNull();
    } finally {
      await testPrisma.user.delete({ where: { id: user.id } });
    }
  });

  it('expone me solo para la identidad validada y conserva los tres roles', async () => {
    currentUser = null;
    const anonymous = await gql<{ me: unknown | null }>(ME);
    expect(anonymous.data?.me).toBeNull();

    const users = await Promise.all(
      (['CUSTOMER', 'AGENT', 'ADMIN'] as const).map((role) =>
        testPrisma.user.create({
          data: {
            email: `me.${role.toLowerCase()}.${crypto.randomUUID()}@example.test`,
            role,
          },
        }),
      ),
    );

    try {
      for (const user of users) {
        currentUser = { id: user.id, role: user.role };
        const result = await gql<{ me: { id: string; email: string; role: string } }>(ME);
        expect(result.errors).toBeUndefined();
        expect(result.data?.me).toEqual({
          id: user.id,
          email: user.email,
          role: user.role,
        });
      }
    } finally {
      currentUser = null;
      await testPrisma.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
    }
  });

  it('construye el contexto desde una sesión válida y rechaza claims incompletos', () => {
    const session: Session = {
      expires: new Date(Date.now() + 60_000).toISOString(),
      user: {
        id: 'user-session-test',
        role: 'AGENT',
        name: null,
        email: null,
        image: null,
      },
    };

    expect(sessionUserFromSession(session)).toEqual({
      id: 'user-session-test',
      role: 'AGENT',
    });
    expect(sessionUserFromSession(null)).toBeNull();
  });

  it('aplica permisos y redirecciones por rol en servidor', () => {
    expect(() => requireRole({ user: null }, ['ADMIN'])).toThrowError(
      expect.objectContaining({ extensions: { code: 'UNAUTHENTICATED' } }),
    );
    expect(() => requireRole({ user: { id: 'c-1', role: 'CUSTOMER' } }, ['ADMIN'])).toThrowError(
      expect.objectContaining({ extensions: { code: 'FORBIDDEN' } }),
    );
    expect(requireRole({ user: { id: 'a-1', role: 'ADMIN' } }, ['ADMIN']).id).toBe('a-1');

    expect(roleRedirect(null, ['CUSTOMER'])).toBe('/login');
    expect(roleRedirect({ role: 'CUSTOMER' }, ['ADMIN'])).toBe('/');
    expect(roleRedirect({ role: 'ADMIN' }, ['ADMIN'])).toBeNull();
  });
});
