import { GraphQLError } from 'graphql';
import { Prisma } from '../../prisma/generated/client';
import { normalizeEmail } from '../../lib/text';
import { builder } from '../builder';
import { hashPassword, isValidPassword } from '../password';

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

builder.queryField('me', (t) =>
  t.prismaField({
    type: 'User',
    nullable: true,
    resolve: (query, _root, _args, ctx) => {
      if (!ctx.user) return null;
      return ctx.prisma.user.findUnique({
        ...query,
        where: { id: ctx.user.id },
      });
    },
  }),
);

builder.mutationField('signupUser', (t) =>
  t.prismaField({
    type: 'User',
    args: {
      name: t.arg.string({ required: false }),
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      const email = normalizeEmail(args.email);
      const name = args.name?.trim() || null;

      if (!validEmail(email)) {
        throw new GraphQLError('Ingresa un correo electrónico válido', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      if (!isValidPassword(args.password)) {
        throw new GraphQLError(
          'La contraseña debe tener al menos 8 caracteres y un máximo de 72 bytes UTF-8',
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      try {
        return await ctx.prisma.user.create({
          ...query,
          data: {
            email,
            name,
            password: await hashPassword(args.password),
            role: 'CUSTOMER',
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new GraphQLError('Ya existe una cuenta con ese correo', {
            extensions: { code: 'CONFLICT' },
          });
        }
        throw error;
      }
    },
  }),
);
