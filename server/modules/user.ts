import { builder } from '../builder';
import { normalize } from '../../lib/text';

builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name', { nullable: true }),
    image: t.exposeString('image', { nullable: true }),
    role: t.string({ resolve: (u) => u.role }),
    profile: t.relation('profile', { nullable: true }),
  }),
});

builder.prismaObject('Profile', {
  fields: (t) => ({
    id: t.exposeID('id'),
    phone: t.exposeString('phone', { nullable: true }),
    country: t.exposeString('country', { nullable: true }),
    locale: t.exposeString('locale'),
    currency: t.exposeString('currency'),
    bio: t.exposeString('bio', { nullable: true }),
  }),
});

// ─────────────────────────────────────────────────────────────
// TEMPORALES — se eliminan en la Tarea 3 (autenticación).
// Registrar usuarios y editar perfiles lo hará la librería de auth,
// y el usuario saldrá de la sesión, nunca de un argumento del cliente.
// ─────────────────────────────────────────────────────────────

builder.mutationField('signupUser', (t) =>
  t.prismaField({
    type: 'User',
    args: {
      name: t.arg.string({ required: false }),
      email: t.arg.string({ required: true }),
    },
    resolve: (query, _root, args, ctx) =>
      ctx.prisma.user.create({
        ...query,
        // Email SIEMPRE normalizado: evita duplicados "Ana@x.com" vs "ana@x.com"
        data: { email: normalize(args.email), name: args.name },
      }),
  }),
);

builder.mutationField('createProfile', (t) =>
  t.prismaField({
    type: 'Profile',
    args: {
      bio: t.arg.string({ required: true }),
      userEmail: t.arg.string({ required: true }),
    },
    resolve: (query, _root, args, ctx) =>
      ctx.prisma.profile.create({
        ...query,
        data: { bio: args.bio, user: { connect: { email: normalize(args.userEmail) } } },
      }),
  }),
);
