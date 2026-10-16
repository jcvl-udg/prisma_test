import { builder } from '../builder';

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
