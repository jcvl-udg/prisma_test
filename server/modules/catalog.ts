import { randomUUID } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { Prisma } from '../../prisma/generated/client';
import { builder } from '../builder';
import type { Context } from '../context';
import { normalize, slugify } from '../../lib/text';

// ─────────────────────────────────────────────────────────────
// LÍMITES: ningún cliente puede pedir miles de filas ni estancias absurdas
// ─────────────────────────────────────────────────────────────
const MAX_TAKE = 50;
const MAX_STAY_NIGHTS = 30;
const MAX_LIST_FILTER = 10; // máximo de temas / amenidades por filtro
const MAX_SEARCH_TOKENS = 5;

// ═════════════════════════════════════════════════════════════
// 1. TIPOS (modelos expuestos por GraphQL)
// Regla: se expone SOLO lo que la UI necesita. Relaciones 1-a-muchos sin
// límite (p. ej. Destination.hotels) NO se exponen: se consultan con
// la query `hotels`, que sí tiene filtros y paginación.
// ═════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════
// 2. FILTROS Y ORDEN (búsqueda v2)
// ═════════════════════════════════════════════════════════════

const HotelSort = builder.enumType('HotelSort', {
  values: ['POPULAR', 'PRICE_ASC', 'PRICE_DESC', 'RATING', 'STARS'] as const,
});

// Un solo objeto `filter` en vez de 12 argumentos sueltos: la UI lo arma desde
// la URL y Codegen lo tipa completo.
const HotelFilter = builder.inputType('HotelFilter', {
  fields: (t) => ({
    query: t.string({ required: false, description: 'Texto libre: hotel, destino o código' }),
    destinationId: t.string({ required: false }),
    minStars: t.int({ required: false }),
    maxStars: t.int({ required: false }),
    minRating: t.float({ required: false, description: 'Calificación mínima (0-10)' }),
    minPrice: t.float({ required: false, description: 'Precio "desde" por noche, mínimo' }),
    maxPrice: t.float({ required: false, description: 'Precio "desde" por noche, máximo' }),
    themes: t.stringList({ required: false, description: 'Cualquiera de estos temas (beach, family...)' }),
    amenities: t.stringList({ required: false, description: 'Códigos; el hotel debe tener TODAS (POOL, SPA...)' }),
    checkIn: t.field({ type: 'Date', required: false }),
    checkOut: t.field({ type: 'Date', required: false }),
    adults: t.int({ required: false, description: 'Por defecto 2 (solo aplica con fechas)' }),
    children: t.int({ required: false, description: 'Por defecto 0 (solo aplica con fechas)' }),
  }),
});
type HotelFilterValue = typeof HotelFilter.$inferInput;

function badInput(message: string): never {
  throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

const toDay = (d: Date) => d.toISOString().slice(0, 10); // 'YYYY-MM-DD'

// ─────────────────────────────────────────────────────────────
// Disponibilidad por fechas.
// Prisma no puede expresar "esta habitación tiene TODAS las noches libres",
// así que se resuelve con SQL: agrupa el inventario por habitación y exige
// que el número de noches con available > 0 sea igual a las noches pedidas.
// Devuelve los IDs de hotel; el resto de filtros se aplica con Prisma.
//
// Simplificación actual: capacidad = maxAdults/maxChildren por separado.
// (Las reglas reales de ocupación llegan con la capa de proveedores, Tarea 5.)
// ─────────────────────────────────────────────────────────────
async function availableHotelIds(ctx: Context, f: HotelFilterValue): Promise<string[] | null> {
  if (!f.checkIn && !f.checkOut) return null; // sin fechas: no se filtra por disponibilidad
  if (!f.checkIn || !f.checkOut) badInput('Indica fecha de entrada y de salida');

  const nights = Math.round((f.checkOut.getTime() - f.checkIn.getTime()) / 86_400_000);
  if (nights < 1) badInput('La salida debe ser posterior a la entrada');
  if (nights > MAX_STAY_NIGHTS) badInput(`La estancia máxima es de ${MAX_STAY_NIGHTS} noches`);

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (f.checkIn.getTime() < todayUtc) badInput('La fecha de entrada no puede estar en el pasado');

  const adults = Math.max(f.adults ?? 2, 1);
  const children = Math.max(f.children ?? 0, 0);
  const destFilter = f.destinationId
    ? Prisma.sql`AND h."destinationId" = ${f.destinationId}`
    : Prisma.empty;

  // Las fechas viajan como 'YYYY-MM-DD'::date (evita desfases por zona horaria)
  const rows = await ctx.prisma.$queryRaw<{ hotelId: string }[]>(Prisma.sql`
    SELECT r."hotelId"
    FROM "Room" r
    JOIN "Hotel" h ON h.id = r."hotelId"
    JOIN "RoomInventory" i ON i."roomId" = r.id
    WHERE h.status = 'ACTIVE'::"HotelStatus"
      ${destFilter}
      AND r."maxAdults" >= ${adults}
      AND r."maxChildren" >= ${children}
      AND i.date >= ${toDay(f.checkIn)}::date
      AND i.date <  ${toDay(f.checkOut)}::date
      AND i.available > 0
    GROUP BY r."hotelId", r.id
    HAVING COUNT(*) = ${nights}::int
  `);

  return [...new Set(rows.map((r) => r.hotelId))];
}

// Convierte el objeto `filter` en el `where` de Prisma.
// Se usa tanto para la lista (hotels) como para el contador (hotelsCount),
// así ambos SIEMPRE coinciden.
async function buildHotelWhere(
  ctx: Context,
  filter: HotelFilterValue | null | undefined,
): Promise<Prisma.HotelWhereInput> {
  const f = filter ?? {};
  const and: Prisma.HotelWhereInput[] = [{ status: 'ACTIVE' }]; // nunca borradores/inactivos

  // Texto libre: cada palabra debe aparecer en searchKey ("grand cancun" encuentra
  // "Grand Cancún Palace"). `contains` sobre searchKey usa el índice GIN trigram.
  const tokens = normalize(f.query ?? '').split(' ').filter(Boolean).slice(0, MAX_SEARCH_TOKENS);
  for (const token of tokens) and.push({ searchKey: { contains: token } });

  if (f.destinationId) and.push({ destinationId: f.destinationId });

  if (f.minStars != null || f.maxStars != null) {
    and.push({
      categoryStars: { gte: Math.max(f.minStars ?? 1, 1), lte: Math.min(f.maxStars ?? 5, 5) },
    });
  }

  if (f.minRating != null) and.push({ ratingAvg: { gte: f.minRating } });

  if (f.minPrice != null || f.maxPrice != null) {
    and.push({
      priceFrom: {
        gte: Math.max(f.minPrice ?? 0, 0),
        ...(f.maxPrice != null ? { lte: f.maxPrice } : {}),
      },
    });
  }

  // Temas: "cualquiera de" (descubrimiento). Usa el índice GIN de themes.
  if (f.themes?.length) {
    and.push({ themes: { hasSome: f.themes.slice(0, MAX_LIST_FILTER).map((x) => x.toLowerCase()) } });
  }

  // Amenidades: "todas" (filtro duro: si pides alberca Y spa, necesita ambas)
  for (const code of (f.amenities ?? []).slice(0, MAX_LIST_FILTER)) {
    and.push({ amenities: { some: { amenity: { code: code.toUpperCase() } } } });
  }

  const ids = await availableHotelIds(ctx, f);
  if (ids) and.push({ id: { in: ids } });

  return { AND: and };
}

// Orden SIEMPRE determinista: `id` desempata, así el cursor nunca repite ni salta filas.
function orderByFor(sort: string | null | undefined): Prisma.HotelOrderByWithRelationInput[] {
  switch (sort) {
    case 'PRICE_ASC':
      return [{ priceFrom: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case 'PRICE_DESC':
      return [{ priceFrom: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
    case 'RATING':
      return [{ ratingAvg: { sort: 'desc', nulls: 'last' } }, { reviewCount: 'desc' }, { id: 'asc' }];
    case 'STARS':
      return [{ categoryStars: 'desc' }, { popularityScore: 'desc' }, { id: 'asc' }];
    default:
      return [{ popularityScore: 'desc' }, { id: 'asc' }];
  }
}

// ═════════════════════════════════════════════════════════════
// 3. QUERIES
// ═════════════════════════════════════════════════════════════

// Búsqueda principal: paginación por cursor (first/after + pageInfo).
// A diferencia de skip/take, no se degrada con páginas profundas y no repite
// resultados si el inventario cambia mientras el usuario hace scroll.
builder.queryField('hotels', (t) =>
  t.prismaConnection({
    type: 'Hotel',
    cursor: 'id',
    defaultSize: 20,
    maxSize: MAX_TAKE,
    args: {
      filter: t.arg({ type: HotelFilter, required: false }),
      sort: t.arg({ type: HotelSort, required: false, defaultValue: 'POPULAR' }),
    },
    resolve: async (query, _root, args, ctx) =>
      ctx.prisma.hotel.findMany({
        ...query, // incluye cursor/take/skip y la selección optimizada por Pothos
        where: await buildHotelWhere(ctx, args.filter),
        orderBy: orderByFor(args.sort),
      }),
  }),
);

// Contador ("123 hoteles"): query aparte para que solo se ejecute si la UI lo pide
builder.queryField('hotelsCount', (t) =>
  t.int({
    args: { filter: t.arg({ type: HotelFilter, required: false }) },
    resolve: async (_root, args, ctx) =>
      ctx.prisma.hotel.count({ where: await buildHotelWhere(ctx, args.filter) }),
  }),
);

builder.queryField('hotelBySlug', (t) =>
  t.prismaField({
    type: 'Hotel',
    nullable: true,
    args: { slug: t.arg.string({ required: true }) },
    resolve: (query, _root, args, ctx) =>
      ctx.prisma.hotel.findFirst({ ...query, where: { slug: args.slug, status: 'ACTIVE' } }),
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

builder.queryField('destinationBySlug', (t) =>
  t.prismaField({
    type: 'Destination',
    nullable: true,
    args: { slug: t.arg.string({ required: true }) },
    resolve: (query, _root, args, ctx) =>
      ctx.prisma.destination.findUnique({ ...query, where: { slug: args.slug } }),
  }),
);

// Catálogo de amenidades para pintar los chips del filtro
builder.queryField('amenities', (t) =>
  t.prismaField({
    type: ['Amenity'],
    resolve: (query, _root, _args, ctx) =>
      ctx.prisma.amenity.findMany({ ...query, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
  }),
);

// ─────────────────────────────────────────────────────────────
// Autocomplete: destinos + hoteles en UNA respuesta, con solo lo que el
// dropdown pinta. Usa `select` (columnas mínimas) en lugar de objetos completos.
// ─────────────────────────────────────────────────────────────
const DestinationSuggestion = builder.objectRef<{
  id: string; slug: string; name: string; code: string | null; countryCode: string;
}>('DestinationSuggestion');
DestinationSuggestion.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    slug: t.exposeString('slug'),
    name: t.exposeString('name'),
    code: t.exposeString('code', { nullable: true }),
    countryCode: t.exposeString('countryCode'),
  }),
});

const HotelSuggestion = builder.objectRef<{
  id: string; slug: string; title: string; categoryStars: number; destinationName: string;
}>('HotelSuggestion');
HotelSuggestion.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    slug: t.exposeString('slug'),
    title: t.exposeString('title'),
    categoryStars: t.exposeInt('categoryStars'),
    destinationName: t.exposeString('destinationName'),
  }),
});

const Suggestions = builder.objectRef<{
  destinations: typeof DestinationSuggestion.$inferType[];
  hotels: typeof HotelSuggestion.$inferType[];
}>('Suggestions');
Suggestions.implement({
  fields: (t) => ({
    destinations: t.field({ type: [DestinationSuggestion], resolve: (s) => s.destinations }),
    hotels: t.field({ type: [HotelSuggestion], resolve: (s) => s.hotels }),
  }),
});

builder.queryField('suggestions', (t) =>
  t.field({
    type: Suggestions,
    args: {
      query: t.arg.string({ required: true }),
      take: t.arg.int({ required: false, defaultValue: 5 }),
    },
    resolve: async (_root, args, ctx) => {
      const tokens = normalize(args.query).split(' ').filter(Boolean).slice(0, MAX_SEARCH_TOKENS);
      if (tokens.join('').length < 2) return { destinations: [], hotels: [] };

      const take = Math.min(Math.max(args.take ?? 5, 1), 10);
      const contains = tokens.map((token) => ({ searchKey: { contains: token } }));

      // Las dos consultas corren EN PARALELO
      const [destinations, hotels] = await Promise.all([
        ctx.prisma.destination.findMany({
          where: { AND: contains },
          select: { id: true, slug: true, name: true, code: true, countryCode: true },
          orderBy: [{ popularityScore: 'desc' }, { id: 'asc' }],
          take: Math.min(take, 3),
        }),
        ctx.prisma.hotel.findMany({
          where: { status: 'ACTIVE', AND: contains },
          select: {
            id: true, slug: true, title: true, categoryStars: true,
            destination: { select: { name: true } },
          },
          orderBy: [{ popularityScore: 'desc' }, { id: 'asc' }],
          take,
        }),
      ]);

      return {
        destinations,
        hotels: hotels.map((h) => ({
          id: h.id, slug: h.slug, title: h.title, categoryStars: h.categoryStars,
          destinationName: h.destination.name,
        })),
      };
    },
  }),
);

// ─────────────────────────────────────────────────────────────
// LEGACY: la usan SearchBar, index.tsx y search.tsx actuales.
// Se elimina cuando el frontend migre a `hotels` + `suggestions`.
// ─────────────────────────────────────────────────────────────
builder.queryField('searchHotels', (t) =>
  t.prismaField({
    type: ['Hotel'],
    deprecationReason: 'Usa hotels(filter, sort, first, after) y suggestions(query)',
    args: {
      query: t.arg.string({ required: false }),
      destinationId: t.arg.string({ required: false }),
      minStars: t.arg.int({ required: false }),
      skip: t.arg.int({ required: false, defaultValue: 0 }),
      take: t.arg.int({ required: false, defaultValue: 10 }),
    },
    resolve: async (query, _root, args, ctx) =>
      ctx.prisma.hotel.findMany({
        ...query,
        where: await buildHotelWhere(ctx, {
          query: args.query,
          destinationId: args.destinationId,
          minStars: args.minStars,
        }),
        skip: Math.max(args.skip ?? 0, 0),
        take: Math.min(Math.max(args.take ?? 10, 1), MAX_TAKE),
        orderBy: orderByFor('POPULAR'),
      }),
  }),
);

// ═════════════════════════════════════════════════════════════
// 4. MUTATIONS
// ═════════════════════════════════════════════════════════════

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
      // `||` (no `??`): una cadena vacía también debe caer al valor por defecto
      const code = (args.destinationCode?.trim() || args.destinationName.slice(0, 3)).toUpperCase();

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