import { randomUUID } from 'node:crypto';
import { builder } from '../builder';
import { normalize, slugify } from '../../lib/text';

// Tope duro: ningún cliente puede pedir miles de filas de golpe
const MAX_TAKE = 50;

// ─────────────────────────────────────────────────────────────
// TIPOS (modelos expuestos por GraphQL)
// Regla: se expone SOLO lo que la UI necesita. Relaciones 1-a-muchos sin
// límite (p. ej. Destination.hotels) NO se exponen: se consultan con
// searchHotels, que sí tiene filtros y paginación.
// ─────────────────────────────────────────────────────────────

builder.prismaObject('Destination', {
  fields: (t) => ({
    id: t.exposeID('id'),
    slug: t.exposeString('slug'),
    name: t.exposeString('name'),
    code: t.exposeString('code', { nullable: true }),
    countryCode: t.exposeString('countryCode'),
    latitude: t.exposeFloat('latitude', { nullable: true }),
    longitude: t.exposeFloat('longitude', { nullable: true }),
    description: t.exposeString('description', { nullable: true }),
    imageUrl: t.exposeString('imageUrl', { nullable: true }),
    themes: t.exposeStringList('themes'),
    popularityScore: t.exposeInt('popularityScore'),
    isFeatured: t.exposeBoolean('isFeatured'),
  }),
});

builder.prismaObject('Hotel', {
  fields: (t) => ({
    id: t.exposeID('id'),
    slug: t.exposeString('slug'),
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true }),
    categoryStars: t.exposeInt('categoryStars'),
    address: t.exposeString('address', { nullable: true }),
    latitude: t.exposeFloat('latitude', { nullable: true }),
    longitude: t.exposeFloat('longitude', { nullable: true }),
    ratingAvg: t.exposeFloat('ratingAvg', { nullable: true }),
    reviewCount: t.exposeInt('reviewCount'),
    popularityScore: t.exposeInt('popularityScore'),
    // Decimal -> String (precisión exacta en JSON)
    priceFrom: t.string({ nullable: true, resolve: (h) => h.priceFrom?.toString() ?? null }),
    priceCurrency: t.exposeString('priceCurrency'),
    themes: t.exposeStringList('themes'),
    mainImageUrl: t.exposeString('mainImageUrl', { nullable: true }),
    destination: t.relation('destination'),
    rooms: t.relation('rooms'),
    images: t.relation('images', { query: { orderBy: { position: 'asc' } } }),
    amenities: t.relation('amenities'),
  }),
});

builder.prismaObject('Room', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    code: t.exposeString('code', { nullable: true }),
    maxAdults: t.exposeInt('maxAdults'),
    maxChildren: t.exposeInt('maxChildren'),
    sizeM2: t.exposeInt('sizeM2', { nullable: true }),
    bedType: t.exposeString('bedType', { nullable: true }),
  }),
});

builder.prismaObject('HotelImage', {
  fields: (t) => ({
    id: t.exposeID('id'),
    url: t.exposeString('url'),
    alt: t.exposeString('alt', { nullable: true }),
    position: t.exposeInt('position'),
  }),
});

builder.prismaObject('Amenity', {
  fields: (t) => ({
    id: t.exposeID('id'),
    code: t.exposeString('code'),
    name: t.exposeString('name'),
    category: t.exposeString('category'),
  }),
});

// Tabla puente: se consulta como  amenities { amenity { code name } }
builder.prismaObject('HotelAmenity', {
  fields: (t) => ({
    amenity: t.relation('amenity'),
  }),
});

// ─────────────────────────────────────────────────────────────
// QUERIES
// (La búsqueda v2 — fechas, cursor, amenidades, precio — es la Tarea 4)
// ─────────────────────────────────────────────────────────────

builder.queryField('searchHotels', (t) =>
  t.prismaField({
    type: ['Hotel'],
    args: {
      query: t.arg.string({ required: false, description: 'Texto libre: hotel, destino o código' }),
      destinationId: t.arg.string({ required: false }),
      minStars: t.arg.int({ required: false }),
      skip: t.arg.int({ required: false, defaultValue: 0 }),
      take: t.arg.int({ required: false, defaultValue: 10 }),
    },
    resolve: (query, _root, args, ctx) => {
      // Se normaliza igual que searchKey (minúsculas, sin acentos): "cancun" == "Cancún".
      // `contains` sobre searchKey usa el índice GIN trigram.
      const text = args.query ? normalize(args.query) : null;

      return ctx.prisma.hotel.findMany({
        ...query, // selección de campos optimizada por Pothos (evita over-fetching)
        where: {
          status: 'ACTIVE', // nunca mostrar borradores/inactivos
          ...(text ? { searchKey: { contains: text } } : {}),
          ...(args.destinationId ? { destinationId: args.destinationId } : {}),
          ...(args.minStars ? { categoryStars: { gte: args.minStars } } : {}),
        },
        skip: Math.max(args.skip ?? 0, 0),
        take: Math.min(Math.max(args.take ?? 10, 1), MAX_TAKE),
        // Orden ESTABLE: el `id` desempata, así la paginación nunca repite ni salta filas
        orderBy: [{ popularityScore: 'desc' }, { id: 'asc' }],
      });
    },
  }),
);

builder.queryField('destinations', (t) =>
  t.prismaField({
    type: ['Destination'],
    args: {
      featuredOnly: t.arg.boolean({ required: false, defaultValue: false }),
      take: t.arg.int({ required: false, defaultValue: 12 }),
    },
    resolve: (query, _root, args, ctx) =>
      ctx.prisma.destination.findMany({
        ...query,
        where: args.featuredOnly ? { isFeatured: true } : {},
        take: Math.min(Math.max(args.take ?? 12, 1), MAX_TAKE),
        orderBy: [{ popularityScore: 'desc' }, { id: 'asc' }],
      }),
  }),
);

// ─────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────

// TODO(Tarea 3): restringir a rol ADMIN con scope-auth. Hoy sigue pública.
builder.mutationField('createManualHotel', (t) =>
  t.prismaField({
    type: 'Hotel',
    args: {
      title: t.arg.string({ required: true }),
      categoryStars: t.arg.int({ required: true }),
      destinationName: t.arg.string({ required: true }),
      destinationCode: t.arg.string({ required: false }),
      countryCode: t.arg.string({ required: true, description: 'ISO 3166-1 alpha-2, ej. MX' }),
    },
    resolve: async (query, _root, args, ctx) => {
      const destSlug = slugify(args.destinationName);
      const code = (args.destinationCode ?? args.destinationName.slice(0, 3)).toUpperCase();

      // upsert por slug: atómico, evita destinos duplicados con peticiones simultáneas
      const destination = await ctx.prisma.destination.upsert({
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

      return ctx.prisma.hotel.create({
        ...query,
        data: {
          slug: `${destSlug}-${slugify(args.title)}`, // choque de slug => error de unicidad
          title: args.title,
          categoryStars: args.categoryStars,
          searchKey: normalize(`${args.title} ${args.destinationName} ${code}`),
          destinationId: destination.id,
          providerMappings: {
            create: {
              externalId: `local-${randomUUID()}`,
              provider: { connect: { code: 'LOCAL' } }, // existe gracias al seed
            },
          },
        },
      });
    },
  }),
);
