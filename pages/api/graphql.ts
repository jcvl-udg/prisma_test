import { createYoga } from 'graphql-yoga'
import SchemaBuilder from "@pothos/core";
import PrismaPlugin from "@pothos/plugin-prisma";

import type PrismaTypes from "../../lib/pothos-prisma-types";
import { getDatamodel } from "../../lib/pothos-prisma-types";
import type { NextApiRequest, NextApiResponse } from 'next'

import prisma from '../../lib/prisma'

import { normalize, slugify } from '../../lib/text';
import { randomUUID } from 'crypto';

const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
}>({
  plugins: [PrismaPlugin],
  prisma: {
    client: prisma,
    dmmf: getDatamodel(),
    onUnusedQuery: process.env.NODE_ENV === 'production' ? null : 'warn',
  }
})

builder.queryType({})
builder.mutationType({})

// --- EXPOSICIÓN DE MODELOS (TIPOS GRAPHQL) ---

builder.prismaObject("User", {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name', { nullable: true }),
    profile: t.relation('profile', { nullable: true }),
  })
})

builder.prismaObject("Profile", {
  fields: (t) => ({
    id: t.exposeID('id'),
    bio: t.exposeString('bio', { nullable: true }),
    user: t.relation('user'),
  }),
})

builder.prismaObject("Destination", {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    code: t.exposeString('code', { nullable: true }),
    hotels: t.relation('hotels')
  })
})

builder.prismaObject('Hotel', {
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    categoryStars: t.exposeInt('categoryStars'),
    destination: t.relation('destination'),
    rooms: t.relation('rooms'),
  }),
});

builder.prismaObject("Room", {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
  })
})

builder.prismaObject('Booking', {
  fields: (t) => ({
    id: t.exposeID('id'),
    status: t.exposeString('status'),
    createdAt: t.string({
      resolve: (booking) => booking.createdAt.toISOString(),
    }),
    items: t.relation('items'),
  }),
});

builder.prismaObject('BookingItem', {
  fields: (t) => ({
    id: t.exposeID('id'),
    hotel: t.relation('hotel'),
    room: t.relation('room'),
  }),
});

// 2. Input Type para el Cart
const BookingItemInput = builder.inputType('BookingItemInput', {
  fields: (t) => ({
    hotelId: t.string({ required: true }),
    roomId: t.string({ required: true }),
  }),
});

// --- QUERIES (BÚSQUEDAS) ---

builder.queryField('searchHotels', (t) =>
  t.prismaField({
    type: ['Hotel'],
    args: {
      query: t.arg.string({ required: false, description: 'Búsqueda de texto libre en título o destino' }),
      destinationId: t.arg.string({ required: false }),
      minStars: t.arg.int({ required: false }),
      skip: t.arg.int({ required: false, defaultValue: 0 }),
      take: t.arg.int({ required: false, defaultValue: 10 }),
    },
    resolve: async (query, root, args, ctx, info) => {
      const { query: searchQuery, destinationId, minStars, skip, take } = args;

      return prisma.hotel.findMany({
        ...query, // Inyecta selecciones de campos optimizadas por Pothos
        where: {
          AND: [
            searchQuery ? {
              OR: [
                { title: { contains: searchQuery, mode: 'insensitive' } },
                { destination: { name: { contains: searchQuery, mode: 'insensitive' } } },
              ],
            } : {},
            destinationId ? { destinationId } : {},
            minStars ? { categoryStars: { gte: minStars } } : {},
          ],
        },
        skip: skip ?? 0,
        take: take ?? 10,
        orderBy: [
          { categoryStars: 'desc' },
          { title: 'asc' }
        ],
      });
    },
  })
);

// --- MUTATIONS (CRUD Y USUARIOS) ---

builder.mutationField('signupUser', (t) =>
  t.prismaField({
    type: 'User',
    args: {
      name: t.arg.string({ required: false }),
      email: t.arg.string({ required: true }),
    },
    resolve: async (query, _parent, args, _info) =>
      prisma.user.create({
        ...query,
        data: {
          email: args.email,
          name: args.name
        }
      })
  })
)

// Corrección del error UserUniqueInput: Pedimos el email directamente como string
builder.mutationField('createProfile', (t) =>
  t.prismaField({
    type: "Profile",
    args: {
      bio: t.arg.string({ required: true }),
      userEmail: t.arg.string({ required: true }) 
    },
    resolve: async (query, _parent, args, _context) =>
      prisma.profile.create({
        ...query,
        data: {
          bio: args.bio,
          user: {
            connect: { email: args.userEmail }
          }
        }
      })
  })
)

// Mutación para que registres tus paquetes/hoteles manualmente desde tu CMS
builder.mutationField('createManualHotel', (t) =>
  t.prismaField({
    type: 'Hotel',
    args: {
      title: t.arg.string({ required: true }),
      categoryStars: t.arg.int({ required: true }),
      destinationName: t.arg.string({ required: true }),
      destinationCode: t.arg.string({ required: false }),
      // Nuevo: el schema v2 exige país en el destino
      countryCode: t.arg.string({ required: true, description: 'ISO 3166-1 alpha-2, ej. MX' }),
    },
    resolve: async (query, _parent, args) => {
      const destSlug = slugify(args.destinationName);
      const code = (args.destinationCode ?? args.destinationName.slice(0, 3)).toUpperCase();
 
      // upsert por slug: atómico, evita destinos duplicados si dos peticiones coinciden
      const destination = await prisma.destination.upsert({
        where: { slug: destSlug },
        update: {},
        create: {
          slug: destSlug,
          name: args.destinationName,
          code,
          countryCode: args.countryCode.toUpperCase(),
          searchKey: normalize(`${args.destinationName} ${code}`),
        },
      });
 
      return prisma.hotel.create({
        ...query,
        data: {
          slug: `${destSlug}-${slugify(args.title)}`, // si ya existe, Prisma lanza error de unicidad
          title: args.title,
          categoryStars: args.categoryStars,
          searchKey: normalize(`${args.title} ${args.destinationName} ${code}`),
          destinationId: destination.id,
          providerMappings: {
            create: {
              externalId: `local-${randomUUID()}`,
              // El proveedor LOCAL ya existe gracias al seed
              provider: { connect: { code: 'LOCAL' } },
            },
          },
        },
      });
    },
  })
);

const schema = builder.toSchema()

export default createYoga<{
  req: NextApiRequest
  res: NextApiResponse
}>({
  schema,
  graphqlEndpoint: '/api/graphql'
})

export const config = {
  api: {
    bodyParser: false
  }
}