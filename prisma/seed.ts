import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from './generated/client';
import { normalize, slugify } from '../lib/text';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN (ajustable por variables de entorno)
//   SEED_DAYS  = días de inventario a generar     (por defecto 90)
//   SEED_SCALE = multiplicador de hoteles         (por defecto 1 ≈ 1 000 hoteles)
// Ejemplo: SEED_SCALE=3 npx tsx prisma/seed.ts  (≈ 3 000 hoteles, prueba de estrés)
// ─────────────────────────────────────────────────────────────
const DAYS = Number(process.env.SEED_DAYS ?? 90);
const HOTEL_SCALE = Number(process.env.SEED_SCALE ?? 1);
const CHUNK = 3_000;

// ─────────────────────────────────────────────────────────────
// Generador pseudoaleatorio CON SEMILLA (mulberry32).
// Mismo seed => mismos datos en cualquier máquina: los bugs de búsqueda
// se pueden reproducir y los tests no dependen del azar.
// ─────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260930);
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) {
    if ((r -= w) <= 0) return item;
  }
  return items[items.length - 1][0];
}

// Muestra sin reemplazo (Fisher-Yates parcial)
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const j = i + Math.floor(rand() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
    out.push(copy[i]);
  }
  return out;
}

// Inserta en lotes para no exceder el límite de parámetros de Postgres
async function inChunks<T>(rows: T[], run: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await run(rows.slice(i, i + CHUNK));
}

// Fechas en UTC a medianoche (columnas @db.Date)
const now = new Date();
const BASE_DAY = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const dayDate = (offset: number) => new Date(BASE_DAY + offset * 86_400_000);

// ─────────────────────────────────────────────────────────────
// DATOS SEMILLA
// pop = popularidad 0-100 · priceIndex = multiplicador de precios del destino
// ─────────────────────────────────────────────────────────────
interface DestSeed {
  name: string; code: string; country: string; lat: number; lng: number;
  themes: string[]; priceIndex: number; pop: number;
}

const DESTINATIONS: DestSeed[] = [
  { name: 'Cancún', code: 'CUN', country: 'MX', lat: 21.16, lng: -86.85, themes: ['beach', 'all-inclusive', 'family', 'nightlife'], priceIndex: 1.0, pop: 95 },
  { name: 'Tulum', code: 'TQO', country: 'MX', lat: 20.21, lng: -87.47, themes: ['beach', 'romantic', 'wellness'], priceIndex: 1.1, pop: 80 },
  { name: 'Playa del Carmen', code: 'PCM', country: 'MX', lat: 20.63, lng: -87.07, themes: ['beach', 'family', 'nightlife'], priceIndex: 0.95, pop: 82 },
  { name: 'Los Cabos', code: 'SJD', country: 'MX', lat: 22.89, lng: -109.91, themes: ['beach', 'luxury', 'romantic', 'golf'], priceIndex: 1.3, pop: 78 },
  { name: 'Puerto Vallarta', code: 'PVR', country: 'MX', lat: 20.65, lng: -105.23, themes: ['beach', 'family', 'romantic'], priceIndex: 0.9, pop: 75 },
  { name: 'Ciudad de México', code: 'MEX', country: 'MX', lat: 19.43, lng: -99.13, themes: ['city', 'culture', 'gastronomy', 'business'], priceIndex: 0.8, pop: 88 },
  { name: 'Oaxaca', code: 'OAX', country: 'MX', lat: 17.06, lng: -96.73, themes: ['culture', 'gastronomy', 'romantic'], priceIndex: 0.7, pop: 60 },
  { name: 'Guadalajara', code: 'GDL', country: 'MX', lat: 20.67, lng: -103.35, themes: ['city', 'culture', 'gastronomy', 'business'], priceIndex: 0.7, pop: 65 },
  { name: 'Nueva York', code: 'JFK', country: 'US', lat: 40.71, lng: -74.0, themes: ['city', 'culture', 'shopping', 'business'], priceIndex: 1.6, pop: 92 },
  { name: 'Miami', code: 'MIA', country: 'US', lat: 25.76, lng: -80.19, themes: ['beach', 'nightlife', 'family'], priceIndex: 1.3, pop: 85 },
  { name: 'Las Vegas', code: 'LAS', country: 'US', lat: 36.17, lng: -115.14, themes: ['nightlife', 'entertainment', 'family'], priceIndex: 1.1, pop: 80 },
  { name: 'Orlando', code: 'MCO', country: 'US', lat: 28.54, lng: -81.38, themes: ['family', 'theme-parks'], priceIndex: 1.0, pop: 84 },
  { name: 'Punta Cana', code: 'PUJ', country: 'DO', lat: 18.58, lng: -68.4, themes: ['beach', 'all-inclusive', 'family'], priceIndex: 1.0, pop: 83 },
  { name: 'Bogotá', code: 'BOG', country: 'CO', lat: 4.71, lng: -74.07, themes: ['city', 'culture', 'business'], priceIndex: 0.65, pop: 62 },
  { name: 'Cartagena', code: 'CTG', country: 'CO', lat: 10.39, lng: -75.51, themes: ['beach', 'romantic', 'culture'], priceIndex: 0.85, pop: 70 },
  { name: 'Río de Janeiro', code: 'GIG', country: 'BR', lat: -22.91, lng: -43.17, themes: ['beach', 'nightlife', 'culture'], priceIndex: 0.9, pop: 80 },
  { name: 'Buenos Aires', code: 'EZE', country: 'AR', lat: -34.6, lng: -58.38, themes: ['city', 'culture', 'gastronomy'], priceIndex: 0.75, pop: 72 },
  { name: 'Lima', code: 'LIM', country: 'PE', lat: -12.05, lng: -77.04, themes: ['city', 'gastronomy', 'culture'], priceIndex: 0.7, pop: 65 },
  { name: 'Cusco', code: 'CUZ', country: 'PE', lat: -13.53, lng: -71.97, themes: ['culture', 'adventure'], priceIndex: 0.75, pop: 68 },
  { name: 'Madrid', code: 'MAD', country: 'ES', lat: 40.42, lng: -3.7, themes: ['city', 'culture', 'gastronomy', 'shopping'], priceIndex: 1.0, pop: 86 },
  { name: 'Barcelona', code: 'BCN', country: 'ES', lat: 41.39, lng: 2.17, themes: ['city', 'beach', 'culture', 'nightlife'], priceIndex: 1.1, pop: 90 },
  { name: 'Mallorca', code: 'PMI', country: 'ES', lat: 39.57, lng: 2.65, themes: ['beach', 'family', 'romantic'], priceIndex: 1.0, pop: 82 },
  { name: 'París', code: 'CDG', country: 'FR', lat: 48.86, lng: 2.35, themes: ['city', 'romantic', 'culture', 'shopping'], priceIndex: 1.5, pop: 96 },
  { name: 'Roma', code: 'FCO', country: 'IT', lat: 41.9, lng: 12.5, themes: ['city', 'culture', 'gastronomy', 'romantic'], priceIndex: 1.2, pop: 91 },
  { name: 'Londres', code: 'LHR', country: 'GB', lat: 51.51, lng: -0.13, themes: ['city', 'culture', 'shopping', 'business'], priceIndex: 1.6, pop: 90 },
  { name: 'Ámsterdam', code: 'AMS', country: 'NL', lat: 52.37, lng: 4.9, themes: ['city', 'culture', 'nightlife'], priceIndex: 1.3, pop: 78 },
  { name: 'Estambul', code: 'IST', country: 'TR', lat: 41.01, lng: 28.98, themes: ['city', 'culture', 'gastronomy'], priceIndex: 0.8, pop: 76 },
  { name: 'Dubái', code: 'DXB', country: 'AE', lat: 25.2, lng: 55.27, themes: ['luxury', 'shopping', 'family', 'city'], priceIndex: 1.7, pop: 89 },
  { name: 'Tokio', code: 'NRT', country: 'JP', lat: 35.68, lng: 139.69, themes: ['city', 'culture', 'gastronomy', 'shopping'], priceIndex: 1.4, pop: 93 },
  { name: 'Bangkok', code: 'BKK', country: 'TH', lat: 13.76, lng: 100.5, themes: ['city', 'culture', 'gastronomy', 'nightlife'], priceIndex: 0.6, pop: 80 },
  { name: 'Bali', code: 'DPS', country: 'ID', lat: -8.41, lng: 115.22, themes: ['beach', 'wellness', 'romantic', 'adventure'], priceIndex: 0.7, pop: 85 },
];

const AMENITIES = [
  { code: 'WIFI', name: 'Wi-Fi gratis', category: 'GENERAL' },
  { code: 'AC', name: 'Aire acondicionado', category: 'GENERAL' },
  { code: 'PARKING', name: 'Estacionamiento', category: 'GENERAL' },
  { code: 'AIRPORT_SHUTTLE', name: 'Traslado al aeropuerto', category: 'GENERAL' },
  { code: 'ACCESSIBLE', name: 'Accesible', category: 'GENERAL' },
  { code: 'PET_FRIENDLY', name: 'Admite mascotas', category: 'GENERAL' },
  { code: 'POOL', name: 'Alberca', category: 'LEISURE' },
  { code: 'GYM', name: 'Gimnasio', category: 'LEISURE' },
  { code: 'SPA', name: 'Spa', category: 'WELLNESS' },
  { code: 'GOLF', name: 'Campo de golf', category: 'LEISURE' },
  { code: 'BEACHFRONT', name: 'Frente a la playa', category: 'LEISURE' },
  { code: 'KIDS_CLUB', name: 'Club infantil', category: 'FAMILY' },
  { code: 'RESTAURANT', name: 'Restaurante', category: 'FOOD' },
  { code: 'BAR', name: 'Bar', category: 'FOOD' },
  { code: 'BREAKFAST', name: 'Desayuno incluido', category: 'FOOD' },
  { code: 'ALL_INCLUSIVE', name: 'Todo incluido', category: 'FOOD' },
  { code: 'ROOM_SERVICE', name: 'Servicio a la habitación', category: 'FOOD' },
  { code: 'BUSINESS_CENTER', name: 'Centro de negocios', category: 'BUSINESS' },
];

const NAME_PREFIXES = ['Grand', 'Royal', 'Boutique', 'Plaza', 'Vista', 'Oasis', 'Imperial', 'Central', 'Golden', 'Blue'];
const NAME_NOUNS = ['Coral', 'Jacaranda', 'Aurora', 'Mirador', 'Zenith', 'Solaris', 'Marina', 'Olivo', 'Cedro', 'Horizonte', 'Alba', 'Lumen', 'Brisa', 'Terra'];
const NAME_SUFFIXES = ['Palace', 'Inn', 'Suites', 'Spa & Resort', 'Retreat', 'Lodge', 'Residences', 'Hotel', 'Collection'];

interface RoomTemplate {
  name: string; code: string; mult: number; adults: number; children: number;
  size: number; bed: string; maxUnits: number;
}
const ROOM_TEMPLATES: RoomTemplate[] = [
  { name: 'Economy Twin', code: 'ETW', mult: 0.85, adults: 2, children: 0, size: 18, bed: 'Twin', maxUnits: 10 },
  { name: 'Standard', code: 'STD', mult: 1.0, adults: 2, children: 1, size: 22, bed: 'Queen', maxUnits: 10 },
  { name: 'Superior', code: 'SUP', mult: 1.15, adults: 2, children: 1, size: 26, bed: 'King', maxUnits: 8 },
  { name: 'Deluxe Ocean View', code: 'DOV', mult: 1.35, adults: 2, children: 1, size: 30, bed: 'King', maxUnits: 6 },
  { name: 'Deluxe City View', code: 'DCV', mult: 1.3, adults: 2, children: 1, size: 28, bed: 'King', maxUnits: 6 },
  { name: 'Family Room', code: 'FAM', mult: 1.5, adults: 4, children: 2, size: 40, bed: '2 Queen', maxUnits: 5 },
  { name: 'Junior Suite', code: 'JRS', mult: 1.8, adults: 3, children: 1, size: 45, bed: 'King', maxUnits: 4 },
  { name: 'Presidential Suite', code: 'PRS', mult: 3.2, adults: 4, children: 2, size: 90, bed: 'King', maxUnits: 2 },
];

const BASE_PRICE_BY_STARS: Record<number, number> = { 2: 45, 3: 70, 4: 120, 5: 230 };

const FIRST_NAMES = ['Ana', 'Luis', 'María', 'Carlos', 'Sofía', 'Diego', 'Valentina', 'Jorge', 'Camila', 'Mateo', 'Lucía', 'Andrés', 'Paula', 'Javier', 'Daniela', 'Sergio', 'Elena', 'Pablo', 'Isabel', 'Rafael'];
const LAST_NAMES = ['García', 'Hernández', 'López', 'Martínez', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales', 'Reyes', 'Ortiz', 'Vargas', 'Castillo'];

// ─────────────────────────────────────────────────────────────
// SEED
// ─────────────────────────────────────────────────────────────
async function main() {
  // Red de seguridad: este script BORRA todo
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed destruye datos: no se ejecuta con NODE_ENV=production');
  }
  const t0 = Date.now();
  console.log(`🌱 Seed iniciado · ${DAYS} días de inventario · escala x${HOTEL_SCALE}`);

  // 1) Limpieza rápida: un solo TRUNCATE con CASCADE (mucho más rápido que N deleteMany)
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "BookingEvent","BookingItem","Booking","Quote","UserEvent","Favorite",
      "HotelAmenity","HotelImage","RoomInventory","RoomMapping","ProviderMapping","Room",
      "Hotel","Amenity","Destination","Provider","Session","Account","VerificationToken",
      "Profile","User" RESTART IDENTITY CASCADE
  `);

  // 2) Proveedores
  const providers = [
    { id: randomUUID(), code: 'LOCAL', name: 'Inventario propio' },
    { id: randomUUID(), code: 'HOTELBEDS', name: 'Hotelbeds (HBX)' },
    { id: randomUUID(), code: 'OMNIBEES', name: 'Omnibees' },
  ];
  await prisma.provider.createMany({ data: providers });
  const providerId = Object.fromEntries(providers.map((p) => [p.code, p.id])) as Record<string, string>;

  // 3) Amenidades
  const amenityRows = AMENITIES.map((a) => ({ id: randomUUID(), ...a }));
  await prisma.amenity.createMany({ data: amenityRows });
  const amenityId = Object.fromEntries(amenityRows.map((a) => [a.code, a.id])) as Record<string, string>;

  // 4) Destinos
  const destRows: Prisma.DestinationCreateManyInput[] = DESTINATIONS.map((d) => ({
    id: randomUUID(),
    slug: slugify(d.name),
    name: d.name,
    code: d.code,
    countryCode: d.country,
    latitude: d.lat,
    longitude: d.lng,
    themes: d.themes,
    popularityScore: d.pop,
    isFeatured: d.pop >= 85,
    description: `Descubre ${d.name}: hoteles seleccionados para viajeros de ${d.themes.slice(0, 2).join(' y ')}.`,
    imageUrl: `https://picsum.photos/seed/${slugify(d.name)}/1200/800`,
    searchKey: normalize(`${d.name} ${d.code}`),
  }));
  await prisma.destination.createMany({ data: destRows });

  // 5) Hoteles + habitaciones + inventario (todo en memoria y luego inserción por lotes)
  const hotels: Prisma.HotelCreateManyInput[] = [];
  const images: Prisma.HotelImageCreateManyInput[] = [];
  const hotelAmenities: Prisma.HotelAmenityCreateManyInput[] = [];
  const rooms: Prisma.RoomCreateManyInput[] = [];
  const inventory: Prisma.RoomInventoryCreateManyInput[] = [];
  const mappings: Prisma.ProviderMappingCreateManyInput[] = [];
  const roomMappings: Prisma.RoomMappingCreateManyInput[] = [];
  const roomsMeta: { id: string; hotelId: string; providerId: string; base: number }[] = [];
  const usedSlugs = new Set<string>();
  let hbCounter = 0;
  let obCounter = 0;

  DESTINATIONS.forEach((d, di) => {
    const dest = destRows[di];
    const count = Math.max(3, Math.round((14 + d.pop / 4) * HOTEL_SCALE));

    for (let h = 0; h < count; h++) {
      const stars = weighted<number>([[2, 8], [3, 32], [4, 40], [5, 20]]);
      const title = weighted<string>([
        [`${pick(NAME_PREFIXES)} ${d.name} ${pick(NAME_SUFFIXES)}`, 4],
        [`${pick(NAME_PREFIXES)} ${pick(NAME_NOUNS)} ${pick(NAME_SUFFIXES)}`, 4],
        [`Hotel ${pick(NAME_NOUNS)} ${d.name}`, 3],
      ]);
      // Slug único por destino; si choca, se añade un contador
      let slug = `${slugify(d.name)}-${slugify(title)}`;
      for (let n = 2; usedSlugs.has(slug); n++) slug = `${slugify(d.name)}-${slugify(title)}-${n}`;
      usedSlugs.add(slug);

      const hotelId = randomUUID();
      const themes = new Set<string>(sample(d.themes, int(1, Math.min(3, d.themes.length))));
      if (stars === 5) themes.add('luxury');
      if (rand() < 0.2) themes.add(pick(['family', 'romantic', 'wellness']));

      const rating = Math.min(9.9, Math.max(5.5, 6.2 + stars * 0.6 + (rand() - 0.5) * 1.6));
      const ratingAvg = Math.round(rating * 10) / 10;

      // Amenidades coherentes con categoría y tema
      const codes = new Set<string>(['WIFI']);
      if (stars >= 3) ['AC', 'RESTAURANT'].forEach((c) => codes.add(c));
      if (stars >= 4) ['POOL', 'GYM', 'BAR'].forEach((c) => codes.add(c));
      if (stars === 5) ['SPA', 'ROOM_SERVICE'].forEach((c) => codes.add(c));
      if (themes.has('beach') && rand() < 0.5) codes.add('BEACHFRONT');
      if (d.themes.includes('all-inclusive') && rand() < 0.4) codes.add('ALL_INCLUSIVE');
      if (themes.has('family') && rand() < 0.5) codes.add('KIDS_CLUB');
      if (d.themes.includes('golf') && rand() < 0.4) codes.add('GOLF');
      if (themes.has('city') && rand() < 0.4) codes.add('BUSINESS_CENTER');
      if (rand() < 0.2) codes.add('PET_FRIENDLY');
      if (rand() < 0.4) codes.add('PARKING');
      if (rand() < 0.3) codes.add('AIRPORT_SHUTTLE');
      if (rand() < 0.5) codes.add('ACCESSIBLE');
      if (rand() < 0.6) codes.add('BREAKFAST');
      codes.forEach((c) => hotelAmenities.push({ hotelId, amenityId: amenityId[c] }));

      // Proveedor(es) del hotel
      const primary = weighted<string>([['LOCAL', 15], ['HOTELBEDS', 60], ['OMNIBEES', 25]]);
      const hotelProviders = [primary];
      if (primary !== 'LOCAL' && rand() < 0.2) hotelProviders.push(primary === 'HOTELBEDS' ? 'OMNIBEES' : 'HOTELBEDS');
      const mappingExternal: Record<string, string> = {};
      for (const code of hotelProviders) {
        const externalId =
          code === 'HOTELBEDS' ? `HB-${d.code}-${10000 + hbCounter++}`
          : code === 'OMNIBEES' ? `OB-${20000 + obCounter++}`
          : `local-${hotelId}`;
        mappingExternal[code] = externalId;
        mappings.push({
          id: randomUUID(), providerId: providerId[code], hotelId, externalId,
          lastSyncedAt: code === 'LOCAL' ? null : new Date(),
        });
      }

      // Habitaciones (tipos) + inventario diario
      const base = BASE_PRICE_BY_STARS[stars] * d.priceIndex;
      const phase = int(0, 75);
      let minPrice: number | null = null;
      const pool = ROOM_TEMPLATES.filter((t) => (t.name.includes('Ocean') ? themes.has('beach') : true));
      const chosen = sample(pool, int(3, Math.min(6, pool.length)));

      for (const t of chosen) {
        const roomId = randomUUID();
        rooms.push({
          id: roomId, hotelId, name: t.name, code: t.code,
          maxAdults: t.adults, maxChildren: t.children, sizeM2: t.size, bedType: t.bed,
        });
        roomsMeta.push({ id: roomId, hotelId, providerId: providerId[primary], base: base * t.mult });

        for (const code of hotelProviders) {
          if (code === 'LOCAL') continue;
          roomMappings.push({
            id: randomUUID(), providerId: providerId[code], roomId,
            externalCode: `${mappingExternal[code]}-${t.code}`,
          });
        }

        for (let i = 0; i < DAYS; i++) {
          const date = dayDate(i);
          const dow = date.getUTCDay();
          const weekend = dow === 5 || dow === 6 ? 1.15 : 1; // viernes/sábado más caros
          const season = 1 + 0.18 * Math.sin((2 * Math.PI * (i + phase)) / 75); // temporadas
          const price = round2(base * t.mult * weekend * season * (0.95 + rand() * 0.1));
          const available = rand() < 0.08 ? 0 : int(1, t.maxUnits); // ~8% de noches cerradas
          inventory.push({ roomId, date, available, priceAmount: price, currency: 'USD' });
          if (available > 0 && (minPrice === null || price < minPrice)) minPrice = price;
        }
      }

      // Imágenes (placeholders estables por slug)
      for (let n = 0; n < 3; n++) {
        images.push({ hotelId, url: `https://picsum.photos/seed/${slug}-${n}/1200/800`, alt: `${title} - foto ${n + 1}`, position: n });
      }

      hotels.push({
        id: hotelId, slug, title, categoryStars: stars, status: 'ACTIVE',
        description: `${title}, ${stars} estrellas en ${d.name}.`,
        latitude: d.lat + (rand() - 0.5) * 0.1,
        longitude: d.lng + (rand() - 0.5) * 0.1,
        ratingAvg, reviewCount: int(15, 3500),
        popularityScore: Math.round(d.pop * 0.3 + stars * 8 + ratingAvg * 4 + rand() * 20),
        priceFrom: minPrice, priceCurrency: 'USD', priceUpdatedAt: new Date(),
        themes: [...themes],
        mainImageUrl: `https://picsum.photos/seed/${slug}-0/1200/800`,
        searchKey: normalize(`${title} ${d.name} ${d.code}`),
        destinationId: String(dest.id),
      });
    }
  });

  console.log(`   Insertando ${hotels.length} hoteles, ${rooms.length} habitaciones, ${inventory.length} noches de inventario...`);
  await inChunks(hotels, (c) => prisma.hotel.createMany({ data: c }));
  await inChunks(images, (c) => prisma.hotelImage.createMany({ data: c }));
  await inChunks(hotelAmenities, (c) => prisma.hotelAmenity.createMany({ data: c }));
  await inChunks(rooms, (c) => prisma.room.createMany({ data: c }));
  await inChunks(inventory, (c) => prisma.roomInventory.createMany({ data: c }));
  await inChunks(mappings, (c) => prisma.providerMapping.createMany({ data: c }));
  await inChunks(roomMappings, (c) => prisma.roomMapping.createMany({ data: c }));

  // 6) Usuarios: 1 admin, 1 agente y 60 clientes con perfil
  const users: Prisma.UserCreateManyInput[] = [
    { id: randomUUID(), email: 'admin@agencia.test', name: 'Admin Agencia', role: 'ADMIN', emailVerified: new Date() },
    { id: randomUUID(), email: 'agente@agencia.test', name: 'Agente Demo', role: 'AGENT', emailVerified: new Date() },
  ];
  for (let i = 0; i < 60; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    users.push({
      id: randomUUID(),
      email: `${normalize(first)}.${normalize(last)}${i}@example.com`, // siempre normalizado
      name: `${first} ${last}`,
      role: 'CUSTOMER',
      emailVerified: rand() < 0.8 ? new Date() : null,
    });
  }
  await prisma.user.createMany({ data: users });
  await prisma.profile.createMany({
    data: users.map((u) => ({
      id: randomUUID(), userId: u.id as string,
      phone: `+52 33 ${int(1000, 9999)} ${int(1000, 9999)}`,
      country: weighted<string>([['MX', 70], ['US', 10], ['CO', 8], ['ES', 6], ['AR', 6]]),
      currency: 'MXN',
    })),
  });
  const customers = users.filter((u) => u.role === 'CUSTOMER');

  // 7) Reservas históricas con ítems y bitácora (estados variados)
  const bookings: Prisma.BookingCreateManyInput[] = [];
  const bookingItems: Prisma.BookingItemCreateManyInput[] = [];
  const bookingEvents: Prisma.BookingEventCreateManyInput[] = [];
  const refs = new Set<string>();
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones al dictarlo

  for (let i = 0; i < 180; i++) {
    const user = rand() < 0.8 ? pick(customers) : null;
    const status = weighted<'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'FAILED' | 'EXPIRED'>([
      ['CONFIRMED', 60], ['PENDING', 15], ['CANCELLED', 15], ['FAILED', 5], ['EXPIRED', 5],
    ]);
    let reference = '';
    do {
      reference = 'AG-' + Array.from({ length: 6 }, () => ALPHABET[int(0, ALPHABET.length - 1)]).join('');
    } while (refs.has(reference));
    refs.add(reference);

    const bookingId = randomUUID();
    const createdAt = new Date(Date.now() - int(0, 45 * 86_400_000));
    let total = 0;

    const nItems = weighted<number>([[1, 65], [2, 25], [3, 10]]);
    for (let k = 0; k < nItems; k++) {
      const meta = pick(roomsMeta);
      const nights = int(2, 7);
      const start = int(5, Math.max(6, DAYS - 10));
      const price = round2(meta.base * nights * (0.9 + rand() * 0.3));
      total += price;
      const isLocal = meta.providerId === providerId.LOCAL;
      bookingItems.push({
        id: randomUUID(), bookingId, hotelId: meta.hotelId, roomId: meta.id, providerId: meta.providerId,
        checkIn: dayDate(start), checkOut: dayDate(start + nights),
        adults: int(1, 2), childrenAges: rand() < 0.25 ? [int(2, 12)] : [],
        priceAmount: price, currency: 'USD', status,
        providerRateKey: isLocal ? null : randomUUID(),
        providerBookingRef: status === 'CONFIRMED' && !isLocal ? `PB-${int(100000, 999999)}` : null,
      });
    }

    bookings.push({
      id: bookingId, reference,
      userId: user ? (user.id as string) : null,
      guestName: user ? (user.name as string) : `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      guestEmail: user ? user.email : `invitado${i}@example.com`,
      status, totalAmount: round2(total), currency: 'USD',
      idempotencyKey: randomUUID(),
      expiresAt: status === 'PENDING' || status === 'EXPIRED' ? new Date(createdAt.getTime() + 30 * 60_000) : null,
      confirmedAt: status === 'CONFIRMED' || status === 'CANCELLED' ? new Date(createdAt.getTime() + 60_000) : null,
      cancelledAt: status === 'CANCELLED' ? new Date(createdAt.getTime() + 86_400_000) : null,
      createdAt,
    });
    bookingEvents.push({ id: randomUUID(), bookingId, type: 'CREATED', createdAt });
    if (status !== 'PENDING') {
      bookingEvents.push({
        id: randomUUID(), bookingId, createdAt: new Date(createdAt.getTime() + 60_000),
        type: status === 'CONFIRMED' ? 'PROVIDER_CONFIRMED' : status === 'FAILED' ? 'PROVIDER_FAILED' : status,
      });
    }
  }
  await prisma.booking.createMany({ data: bookings });
  await prisma.bookingItem.createMany({ data: bookingItems });
  await prisma.bookingEvent.createMany({ data: bookingEvents });

  // 8) Señales de comportamiento (recomendaciones) y favoritos
  // Los hoteles populares reciben más tráfico: índice = rand² => sesgo hacia el inicio
  const hotelsByPop = [...hotels].sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0));
  const popularHotel = () => hotelsByPop[Math.floor(rand() * rand() * hotelsByPop.length)];
  const destByHotel = new Map(hotels.map((h) => [h.id as string, h.destinationId]));

  const events: Prisma.UserEventCreateManyInput[] = [];
  for (let i = 0; i < 4000; i++) {
    const type = weighted<'SEARCH' | 'HOTEL_VIEW' | 'CART_ADD' | 'CHECKOUT_START' | 'BOOKED'>([
      ['SEARCH', 35], ['HOTEL_VIEW', 45], ['CART_ADD', 10], ['CHECKOUT_START', 6], ['BOOKED', 4],
    ]);
    const isUser = rand() < 0.5;
    const createdAt = new Date(Date.now() - int(0, 30 * 86_400_000));
    if (type === 'SEARCH') {
      const d = pick(destRows);
      events.push({ id: randomUUID(), type, createdAt, destinationId: d.id, query: d.name,
        userId: isUser ? (pick(customers).id as string) : null, anonymousId: isUser ? null : `anon-${int(1, 400)}` });
    } else {
      const h = popularHotel();
      events.push({ id: randomUUID(), type, createdAt, hotelId: h.id as string, destinationId: destByHotel.get(h.id as string),
        userId: isUser ? (pick(customers).id as string) : null, anonymousId: isUser ? null : `anon-${int(1, 400)}` });
    }
  }
  await inChunks(events, (c) => prisma.userEvent.createMany({ data: c }));

  const favorites: Prisma.FavoriteCreateManyInput[] = [];
  for (const u of customers) {
    const ids = new Set<string>();
    for (let n = int(0, 6); n > 0; n--) ids.add(popularHotel().id as string);
    ids.forEach((hotelId) => favorites.push({ userId: u.id as string, hotelId }));
  }
  await prisma.favorite.createMany({ data: favorites });

  // 9) Resumen
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `✅ Listo en ${secs}s · ${destRows.length} destinos · ${hotels.length} hoteles · ${rooms.length} habitaciones · ` +
      `${inventory.length} noches · ${users.length} usuarios · ${bookings.length} reservas · ${events.length} eventos`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());