import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  Prisma,
  type CancellationType,
  type POIKind,
  type PaymentType,
  type PropertyType,
} from './generated/client';
import { normalize, slugify } from '../lib/text';
import { Pool } from 'pg';

import bcrypt from 'bcryptjs';
import { allocateHotelCounts, getSeedConfig } from './seed-lib/config';
import {
  buildAmenityCodes,
  createRandom,
  logNormal as generateLogNormal,
  priceBucketFor,
  weightedPick,
} from './seed-lib/generators';
import { isSeedStepComplete, markSeedStepComplete } from './seed-lib/progress';
import { copyRoomInventory } from './seed-lib/copy-helper';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 1,                            // 1 sola conexión: elimina el warning de "already executing"
  idleTimeoutMillis: 0,              // nunca cerrar por idle
  connectionTimeoutMillis: 30_000,   // 30s para conectar
  statement_timeout: 0,              // sin timeout de statement
  query_timeout: 0,                  // sin timeout de query
});

const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN: SEED_PROFILE=dev|demo|stress; SEED_DAYS y SEED_SCALE
// se conservan como overrides compatibles con el seeder anterior.
// ─────────────────────────────────────────────────────────────
const SEED_CONFIG = getSeedConfig({
  SEED_PROFILE: process.env.SEED_PROFILE,
  SEED_DAYS: process.env.SEED_DAYS,
  SEED_SCALE: process.env.SEED_SCALE,
});
const { days: DAYS, hotels: HOTEL_COUNT, events: EVENT_COUNT } = SEED_CONFIG;
const CHUNK = 500;

// ─────────────────────────────────────────────────────────────
// Generador pseudoaleatorio CON SEMILLA (mulberry32).
// Mismo seed => mismos datos en cualquier máquina: los bugs de búsqueda
// se pueden reproducir y los tests no dependen del azar.
// ─────────────────────────────────────────────────────────────
let rand = createRandom(20260930);
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

function weighted<T>(items: [T, number][]): T {
  return weightedPick(rand, items);
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

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

// Inserta en lotes para no exceder el límite de parámetros de Postgres
async function inChunks<T>(rows: T[], run: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await run(rows.slice(i, i + CHUNK));
}

// Fechas en UTC a medianoche (columnas @db.Date)
const now = new Date();
const BASE_DAY = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const dayDate = (offset: number) => new Date(BASE_DAY + offset * 86_400_000);
const SEED_CONFIG_KEY =
  `${SEED_CONFIG.profile}-hotels-${HOTEL_COUNT}-days-${DAYS}-events-${EVENT_COUNT}`;

function seedFor(label: string): number {
  let hash = 2_166_136_261;
  for (const character of label) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  }
  return hash >>> 0;
}

async function resetSeedData(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "_SeedProgress","HotelPointOfInterest","HotelTag","PointOfInterest",
      "BookingEvent","BookingItem","Booking","Quote","UserEvent","Favorite",
      "HotelAmenity","HotelImage","RoomInventory","RoomMapping","ProviderMapping","Room",
      "Hotel","Amenity","Destination","Provider","Session","Account","VerificationToken",
      "Profile","User" RESTART IDENTITY CASCADE
  `);
}

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
  { code: 'POOL', name: 'Alberca', category: 'RECREATION' },
  { code: 'GYM', name: 'Gimnasio', category: 'RECREATION' },
  { code: 'SPA', name: 'Spa', category: 'WELLNESS' },
  { code: 'GOLF', name: 'Campo de golf', category: 'RECREATION' },
  { code: 'BEACHFRONT', name: 'Frente a la playa', category: 'RECREATION' },
  { code: 'KIDS_CLUB', name: 'Club infantil', category: 'FAMILY' },
  { code: 'RESTAURANT', name: 'Restaurante', category: 'FOOD' },
  { code: 'BAR', name: 'Bar', category: 'FOOD' },
  { code: 'BREAKFAST', name: 'Desayuno incluido', category: 'FOOD' },
  { code: 'ALL_INCLUSIVE', name: 'Todo incluido', category: 'FOOD' },
  { code: 'ROOM_SERVICE', name: 'Servicio a la habitación', category: 'FOOD' },
  { code: 'BUSINESS_CENTER', name: 'Centro de negocios', category: 'BUSINESS' },
  { code: 'HEATING', name: 'Calefacción', category: 'GENERAL' },
  { code: 'FREE_PARKING', name: 'Estacionamiento gratuito', category: 'GENERAL' },
  { code: 'EV_CHARGER', name: 'Cargador para vehículos eléctricos', category: 'GENERAL' },
  { code: 'LUGGAGE_STORAGE', name: 'Consigna de equipaje', category: 'GENERAL' },
  { code: '24H_FRONT_DESK', name: 'Recepción 24 horas', category: 'GENERAL' },
  { code: 'CONCIERGE', name: 'Conserjería', category: 'GENERAL' },
  { code: 'LAUNDRY', name: 'Lavandería', category: 'GENERAL' },
  { code: 'LOUNGE', name: 'Salón', category: 'FOOD' },
  { code: 'ROOFTOP_BAR', name: 'Bar en azotea', category: 'FOOD' },
  { code: 'COFFEE_SHOP', name: 'Cafetería', category: 'FOOD' },
  { code: 'VEGAN_OPTIONS', name: 'Opciones veganas', category: 'FOOD' },
  { code: 'HALAL', name: 'Opciones halal', category: 'FOOD' },
  { code: 'KOSHER', name: 'Opciones kosher', category: 'FOOD' },
  { code: 'SAUNA', name: 'Sauna', category: 'WELLNESS' },
  { code: 'JACUZZI', name: 'Jacuzzi', category: 'WELLNESS' },
  { code: 'MASSAGE', name: 'Masajes', category: 'WELLNESS' },
  { code: 'YOGA', name: 'Yoga', category: 'WELLNESS' },
  { code: 'MEDITATION', name: 'Meditación', category: 'WELLNESS' },
  { code: 'HOT_SPRING', name: 'Aguas termales', category: 'WELLNESS' },
  { code: 'BEAUTY_SALON', name: 'Salón de belleza', category: 'WELLNESS' },
  { code: 'BABYSITTING', name: 'Cuidado de niños', category: 'FAMILY' },
  { code: 'PLAYGROUND', name: 'Área de juegos', category: 'FAMILY' },
  { code: 'KIDS_POOL', name: 'Alberca infantil', category: 'FAMILY' },
  { code: 'FAMILY_ROOMS', name: 'Habitaciones familiares', category: 'FAMILY' },
  { code: 'INDOOR_POOL', name: 'Alberca interior', category: 'RECREATION' },
  { code: 'OUTDOOR_POOL', name: 'Alberca exterior', category: 'RECREATION' },
  { code: 'INFINITY_POOL', name: 'Alberca infinita', category: 'RECREATION' },
  { code: 'TENNIS', name: 'Tenis', category: 'RECREATION' },
  { code: 'PADEL', name: 'Pádel', category: 'RECREATION' },
  { code: 'MINI_GOLF', name: 'Minigolf', category: 'RECREATION' },
  { code: 'WATER_SPORTS', name: 'Deportes acuáticos', category: 'RECREATION' },
  { code: 'DIVING', name: 'Buceo', category: 'RECREATION' },
  { code: 'SNORKELING', name: 'Esnórquel', category: 'RECREATION' },
  { code: 'SURF_SCHOOL', name: 'Escuela de surf', category: 'RECREATION' },
  { code: 'SKI_STORAGE', name: 'Guardaesquís', category: 'RECREATION' },
  { code: 'BIKE_RENTAL', name: 'Alquiler de bicicletas', category: 'RECREATION' },
  { code: 'GAME_ROOM', name: 'Sala de juegos', category: 'RECREATION' },
  { code: 'CINEMA', name: 'Cine', category: 'RECREATION' },
  { code: 'KARAOKE', name: 'Karaoke', category: 'RECREATION' },
  { code: 'FREE_SHUTTLE', name: 'Traslado gratuito', category: 'TRANSPORT' },
  { code: 'CAR_RENTAL', name: 'Alquiler de automóviles', category: 'TRANSPORT' },
  { code: 'TAXI_SERVICE', name: 'Servicio de taxi', category: 'TRANSPORT' },
  { code: 'BIKE_PARKING', name: 'Estacionamiento para bicicletas', category: 'TRANSPORT' },
  { code: 'MEETING_ROOMS', name: 'Salas de reuniones', category: 'BUSINESS' },
  { code: 'CONFERENCE_FACILITIES', name: 'Instalaciones para conferencias', category: 'BUSINESS' },
  { code: 'COWORKING', name: 'Espacio de coworking', category: 'BUSINESS' },
  { code: 'PRINTER', name: 'Impresora', category: 'BUSINESS' },
  { code: 'WHEELCHAIR_ACCESSIBLE', name: 'Acceso para silla de ruedas', category: 'ACCESSIBILITY' },
  { code: 'WHEELCHAIR_RENTAL', name: 'Alquiler de sillas de ruedas', category: 'ACCESSIBILITY' },
  { code: 'BRAILLE', name: 'Señalización en braille', category: 'ACCESSIBILITY' },
  { code: 'AUDIO_GUIDE', name: 'Audioguía', category: 'ACCESSIBILITY' },
  { code: 'HEARING_LOOP', name: 'Bucle magnético', category: 'ACCESSIBILITY' },
  { code: 'SERVICE_ANIMALS', name: 'Animales de asistencia', category: 'ACCESSIBILITY' },
  { code: 'ACCESSIBLE_BATHROOM', name: 'Baño accesible', category: 'ACCESSIBILITY' },
  { code: 'ACCESSIBLE_PARKING', name: 'Estacionamiento accesible', category: 'ACCESSIBILITY' },
  { code: 'ELEVATOR', name: 'Elevador', category: 'ACCESSIBILITY' },
  { code: 'ECO_CERTIFIED', name: 'Certificación ecológica', category: 'SUSTAINABILITY' },
  { code: 'SOLAR_POWER', name: 'Energía solar', category: 'SUSTAINABILITY' },
  { code: 'WATER_RECYCLING', name: 'Reciclaje de agua', category: 'SUSTAINABILITY' },
  { code: 'LOCAL_SOURCING', name: 'Abastecimiento local', category: 'SUSTAINABILITY' },
  { code: 'CARBON_NEUTRAL', name: 'Carbono neutral', category: 'SUSTAINABILITY' },
  { code: 'NO_SINGLE_USE_PLASTIC', name: 'Sin plásticos de un solo uso', category: 'SUSTAINABILITY' },
  { code: 'GREEN_KEY', name: 'Certificación Green Key', category: 'SUSTAINABILITY' },
  { code: 'LEED_CERTIFIED', name: 'Certificación LEED', category: 'SUSTAINABILITY' },
  { code: 'CCTV', name: 'Videovigilancia', category: 'SAFETY' },
  { code: 'SAFE_DEPOSIT', name: 'Caja de seguridad', category: 'SAFETY' },
  { code: 'SMOKE_DETECTORS', name: 'Detectores de humo', category: 'SAFETY' },
  { code: 'FIRE_EXTINGUISHERS', name: 'Extintores', category: 'SAFETY' },
  { code: 'FIRST_AID', name: 'Primeros auxilios', category: 'SAFETY' },
  { code: '24H_SECURITY', name: 'Seguridad 24 horas', category: 'SAFETY' },
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

const BASE_PRICE_BY_STARS: Record<number, number> = { 2: 45, 3: 70, 4: 120, 5: 380 };
const CHAIN_BRANDS = ['Aleca Collection', 'Marriott', 'Hilton', 'Hyatt', 'Accor', 'Wyndham'];
const chainBrandByRegion = new Map<string, string>();
const VIBES = ['modern', 'classic', 'rustic', 'minimalist', 'bohemian', 'colonial', 'contemporary', 'traditional'];
const HOTEL_THEMES = [
  'beach', 'city', 'mountain', 'romantic', 'family', 'business', 'wellness', 'nightlife', 'adventure',
  'culture', 'gastronomy', 'shopping', 'luxury', 'all-inclusive', 'adults-only', 'lgbtq-friendly',
  'digital-nomad', 'seniors', 'pet-friendly', 'eco', 'ski', 'golf', 'surf', 'hiking', 'art', 'design',
];
const AUDIENCES = ['families', 'couples', 'business-travelers', 'solo-travelers', 'adults-only', 'digital-nomads'];
const CERTIFICATIONS = ['eco-certified', 'green-key', 'leed-certified', 'carbon-neutral'];
const AWARDS = ['guest-favorite', 'design-award', 'best-value', 'travelers-choice'];

function getChainBrand(region: string): string {
  let brand = chainBrandByRegion.get(region);
  if (!brand) {
    const index = [...region].reduce((sum, character) => sum + character.charCodeAt(0), 0) % CHAIN_BRANDS.length;
    brand = CHAIN_BRANDS[index];
    chainBrandByRegion.set(region, brand);
  }
  return brand;
}

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
  if (process.env.SEED_RESUME !== undefined && !['0', '1'].includes(process.env.SEED_RESUME)) {
    throw new Error('SEED_RESUME solo admite "0" o "1".');
  }
  const resumeRequested = process.env.SEED_RESUME === '1';
  const previousConfig = resumeRequested
    ? await prisma.seedProgress.findMany({ where: { phase: 'config' }, select: { subPhase: true } })
    : [];
  if (previousConfig.length && !previousConfig.some(({ subPhase }) => subPhase === SEED_CONFIG_KEY)) {
    throw new Error(
      `La configuración guardada del seed no coincide con ${SEED_CONFIG_KEY}. ` +
      'Ejecuta el seed sin SEED_RESUME=1 para iniciar desde cero.',
    );
  }
  const resume = resumeRequested && previousConfig.length > 0;
  if (!resume || !(await isSeedStepComplete(prisma, 'setup', 'catalog'))) {
    if (resume) {
      console.warn('   La preparación del catálogo quedó incompleta; se reiniciará el seed para evitar datos parciales.');
    }
    await resetSeedData();
    await markSeedStepComplete(prisma, 'config', SEED_CONFIG_KEY);
  }
  const SEED_PASSWORD_HASH = await bcrypt.hash('password123', 10);

  const t0 = Date.now();
  console.log(
    `🌱 Seed ${SEED_CONFIG.profile} · ${HOTEL_COUNT} hoteles · ${DAYS} días de inventario · ${EVENT_COUNT} eventos`,
  );

  const poiTemplates: { kind: POIKind; name: string; themes?: string[] }[] = [
    { kind: 'AIRPORT', name: 'Aeropuerto Internacional' },
    { kind: 'BEACH', name: 'Playa', themes: ['beach'] },
    { kind: 'LANDMARK', name: 'Centro histórico' },
    { kind: 'MALL', name: 'Centro comercial' },
    { kind: 'PARK', name: 'Parque principal' },
    { kind: 'MUSEUM', name: 'Museo regional' },
    { kind: 'CONVENTION_CENTER', name: 'Centro de convenciones', themes: ['business'] },
    { kind: 'STADIUM', name: 'Estadio municipal' },
  ];

  const setupComplete = await isSeedStepComplete(prisma, 'setup', 'catalog');
  let providerRows = await prisma.provider.findMany({ select: { id: true, code: true } });
  let amenityRows = await prisma.amenity.findMany({ select: { id: true, code: true } });
  let destRows = await prisma.destination.findMany({
    orderBy: { slug: 'asc' },
    select: {
      id: true, slug: true, name: true, code: true, countryCode: true,
      latitude: true, longitude: true, themes: true, popularityScore: true,
      isFeatured: true, description: true, imageUrl: true, searchKey: true,
    },
  });
  if (!setupComplete) {
    // 1) Catálogo base
    const providers = [
      { id: randomUUID(), code: 'LOCAL', name: 'Inventario propio' },
      { id: randomUUID(), code: 'HOTELBEDS', name: 'Hotelbeds (HBX)' },
      { id: randomUUID(), code: 'OMNIBEES', name: 'Omnibees' },
    ];
    await prisma.provider.createMany({ data: providers });
    providerRows = providers;

    const generatedAmenities = AMENITIES.map((a) => ({ id: randomUUID(), ...a }));
    await prisma.amenity.createMany({ data: generatedAmenities });
    amenityRows = generatedAmenities;

    const generatedDestinations: Prisma.DestinationCreateManyInput[] = DESTINATIONS.map((d) => ({
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
    await prisma.destination.createMany({ data: generatedDestinations });
    destRows = await prisma.destination.findMany({
      orderBy: { slug: 'asc' },
      select: {
        id: true, slug: true, name: true, code: true, countryCode: true,
        latitude: true, longitude: true, themes: true, popularityScore: true,
        isFeatured: true, description: true, imageUrl: true, searchKey: true,
      },
    });

    const poiRows: Prisma.PointOfInterestCreateManyInput[] = [];
    const generatedDestinationIds = new Map(
      destRows.map((destination) => [destination.slug, destination.id]),
    );
    for (const destination of DESTINATIONS) {
      const destinationRowId = generatedDestinationIds.get(slugify(destination.name));
      if (!destinationRowId) throw new Error(`No se generó el destino "${destination.name}".`);
      const templates = poiTemplates.filter(
        (template) => !template.themes || template.themes.some((theme) => destination.themes.includes(theme)),
      );
      const airport = templates.find((template) => template.kind === 'AIRPORT');
      if (!airport) throw new Error(`Falta una plantilla de aeropuerto para ${destination.name}.`);
      const selected = [airport, ...sample(templates.filter((template) => template !== airport), 4)];
      selected.forEach((template) => {
        poiRows.push({
          id: randomUUID(),
          kind: template.kind,
          name: `${destination.name} ${template.name}`,
          latitude: destination.lat + (rand() - 0.5) * 0.08,
          longitude: destination.lng + (rand() - 0.5) * 0.08,
          destinationId: destinationRowId,
        });
      });
    }
    await prisma.pointOfInterest.createMany({ data: poiRows });
    await markSeedStepComplete(prisma, 'setup', 'catalog');
  } else {
    console.log('   Catálogo base ya completado; se reutiliza.');
  }

  const providerId = Object.fromEntries(providerRows.map((p) => [p.code, p.id])) as Record<string, string>;
  const getProviderId = (code: string): string => {
    const id = providerId[code];
    if (!id) throw new Error(`No existe el proveedor ${code} en los datos semilla.`);
    return id;
  };
  const amenityId = Object.fromEntries(amenityRows.map((a) => [a.code, a.id])) as Record<string, string>;
  const destinationId = new Map(destRows.map((destination) => [destination.slug, destination.id]));
  const getDestinationId = (slug: string): string => {
    const id = destinationId.get(slug);
    if (!id) throw new Error(`No existe el destino "${slug}" en el catálogo.`);
    return id;
  };
  const pois = await prisma.pointOfInterest.findMany({
    select: { id: true, destinationId: true, kind: true, latitude: true, longitude: true },
  });
  const poiByDestination = new Map<string, typeof pois>();
  for (const poi of pois) {
    const destinationPois = poiByDestination.get(poi.destinationId) ?? [];
    destinationPois.push(poi);
    poiByDestination.set(poi.destinationId, destinationPois);
  }

  // 5) Hoteles + habitaciones + inventario (todo en memoria y luego inserción por lotes)
  const hotels: Prisma.HotelCreateManyInput[] = [];
  const images: Prisma.HotelImageCreateManyInput[] = [];
  const hotelAmenities: Prisma.HotelAmenityCreateManyInput[] = [];
  const rooms: Prisma.RoomCreateManyInput[] = [];
  const inventory: Prisma.RoomInventoryCreateManyInput[] = [];
  const mappings: Prisma.ProviderMappingCreateManyInput[] = [];
  const roomMappings: Prisma.RoomMappingCreateManyInput[] = [];
  const hotelTags: Prisma.HotelTagCreateManyInput[] = [];
  const hotelPOIs: Prisma.HotelPointOfInterestCreateManyInput[] = [];
  const roomsMeta: { id: string; hotelId: string; providerId: string; base: number }[] = [];
  const usedSlugs = new Set<string>();
  let hbCounter = 0;
  let obCounter = 0;

    // ── Contadores de lo realmente insertado (los arrays se vacían con splice) ──
    let roomsBuilt = 0;
    let inventoryBuilt = 0;
  
    // ── Datos ligeros que sobreviven al flush (para reservas/eventos de la sección 6+) ──
    const hotelsLite: { id: string; popularityScore: number; destinationId: string }[] = [];
  
    // ── Tamaño de batch: cuántos hoteles acumulamos antes de vaciar a la DB ──
    const HOTEL_BATCH_SIZE = 20;
    let hotelsInBatch = 0;
  
    // ── Flush: respeta el orden de dependencias FK ──
    async function withRetry<T>(
      label: string,
      fn: () => Promise<T>,
      attempts = 3,
    ): Promise<T> {
      let lastErr: unknown;
      for (let i = 0; i < attempts; i++) {
        try {
          return await fn();
        } catch (e: any) {
          lastErr = e;
          const code = e?.code ?? e?.meta?.driverAdapterError?.code;
          console.warn(`   [retry ${i + 1}/${attempts}] ${label} falló (code=${code})`);
          await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        }
      }
      throw lastErr;
    }
    
    async function flushBatch() {
      if (hotels.length) {
        const batch = hotels.splice(0);
        await withRetry('hotels', () =>
          inChunks(batch, (c) => prisma.hotel.createMany({ data: c, skipDuplicates: true })),
        );
      }
      if (images.length) {
        const batch = images.splice(0);
        await withRetry('images', () =>
          inChunks(batch, (c) => prisma.hotelImage.createMany({ data: c, skipDuplicates: true })),
        );
      }
      if (hotelAmenities.length) {
        const batch = hotelAmenities.splice(0);
        await withRetry('hotelAmenities', () =>
          inChunks(batch, (c) => prisma.hotelAmenity.createMany({ data: c, skipDuplicates: true })),
        );
      }
      if (hotelTags.length) {
        const batch = hotelTags.splice(0);
        await withRetry('hotelTags', () =>
          inChunks(batch, (c) => prisma.hotelTag.createMany({ data: c, skipDuplicates: true })),
        );
      }
      if (hotelPOIs.length) {
        const batch = hotelPOIs.splice(0);
        await withRetry('hotelPOIs', () =>
          inChunks(batch, (c) => prisma.hotelPointOfInterest.createMany({ data: c, skipDuplicates: true })),
        );
      }
      if (mappings.length) {
        const batch = mappings.splice(0);
        await withRetry('mappings', () =>
          inChunks(batch, (c) => prisma.providerMapping.createMany({ data: c, skipDuplicates: true })),
        );
      }
      if (rooms.length) {
        const batch = rooms.splice(0);
        roomsBuilt += batch.length;
        await withRetry('rooms', () =>
          inChunks(batch, (c) => prisma.room.createMany({ data: c, skipDuplicates: true })),
        );
      }
      if (inventory.length) {
        const batch = inventory.splice(0);
        inventoryBuilt += batch.length;
        if (Math.floor((inventoryBuilt - batch.length) / 5_000) < Math.floor(inventoryBuilt / 5_000)) {
          console.log(`   ... ${inventoryBuilt.toLocaleString()} noches de inventario`);
        }
        const insertInventory = () => inChunks(
          batch,
          (chunk) => prisma.roomInventory.createMany({ data: chunk, skipDuplicates: true }),
        );
        await withRetry('inventory', () =>
          SEED_CONFIG.profile === 'stress'
            ? copyRoomInventory(pool, batch, insertInventory)
            : insertInventory(),
        );
      }
      if (roomMappings.length) {
        const batch = roomMappings.splice(0);
        await withRetry('roomMappings', () =>
          inChunks(batch, (c) => prisma.roomMapping.createMany({ data: c, skipDuplicates: true })),
        );
      }
    }

  const hotelCounts = allocateHotelCounts(
    HOTEL_COUNT,
    DESTINATIONS.map(({ code, pop }) => ({ code, popularity: pop })),
  );
  for (const [di, d] of DESTINATIONS.entries()) {
    const destId = getDestinationId(slugify(d.name));
    const count = hotelCounts[di];
    const destinationStep = slugify(d.name);
    if (resume && await isSeedStepComplete(prisma, 'hotels', destinationStep)) {
      console.log(`   Destino ya completado: ${d.name}`);
      continue;
    }
    if (resume) {
      await prisma.hotel.deleteMany({ where: { destinationId: destId } });
    }
    rand = createRandom(seedFor(`destination:${d.code}`));

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
      if (stars === 5 && rand() < 0.4) themes.add('adults-only');
      if (rand() < 0.08) themes.add(pick(HOTEL_THEMES));
      if (rand() < 0.2) themes.add(pick(['family', 'romantic', 'wellness']));
      const vibes = sample(VIBES, int(1, 3));

      const rating = Math.min(9.9, Math.max(5.5, 6.2 + stars * 0.6 + (rand() - 0.5) * 1.6));
      const ratingAvg = Math.round(rating * 10) / 10;

      // Amenidades coherentes con categoría y tema
      const codes = buildAmenityCodes(
        rand,
        stars,
        themes,
        d.themes,
        AMENITIES.map((amenity) => amenity.code),
      );
      codes.forEach((c) => hotelAmenities.push({ hotelId, amenityId: amenityId[c] }));
      for (const [kind, values] of [
        ['AUDIENCE', AUDIENCES],
        ['VIBE', vibes],
        ['CERTIFICATION', CERTIFICATIONS],
        ['AWARD', AWARDS],
      ] as const) {
        const selected = kind === 'VIBE' ? values : rand() < 0.35 ? [pick([...values])] : [];
        selected.forEach((value) => hotelTags.push({ hotelId, kind, value }));
      }

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
          id: randomUUID(), providerId: getProviderId(code), hotelId, externalId,
          lastSyncedAt: code === 'LOCAL' ? null : new Date(),
        });
      }

      // Habitaciones (tipos) + inventario diario
      const base = BASE_PRICE_BY_STARS[stars] * d.priceIndex;
      const phase = int(0, 75);
      let minPrice: number | null = null;
      const hotelLatitude = d.lat + (rand() - 0.5) * 0.1;
      const hotelLongitude = d.lng + (rand() - 0.5) * 0.1;
      const poiCandidates = poiByDestination.get(destId) ?? [];
      const hotelPoiSelection = sample(poiCandidates, Math.min(poiCandidates.length, int(1, 3)));
      hotelPoiSelection.forEach((poi) =>
        hotelPOIs.push({
          hotelId,
          poiId: poi.id,
          distanceMeters: distanceMeters(hotelLatitude, hotelLongitude, poi.latitude, poi.longitude),
        }),
      );
      const chain = rand() < 0.3;
      const regionChainBrand = getChainBrand(d.country);
      const hotelBoardTypes = sample(
        ['ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE'] as const,
        int(1, 3),
      );
      const pool = ROOM_TEMPLATES.filter((t) => (t.name.includes('Ocean') ? themes.has('beach') : true));
      const chosen = sample(pool, int(3, Math.min(6, pool.length)));

      for (const t of chosen) {
        const roomId = randomUUID();
        rooms.push({
          id: roomId, hotelId, name: t.name, code: t.code,
          maxAdults: t.adults, maxChildren: t.children, sizeM2: t.size, bedType: t.bed,
          viewType: t.name.includes('Ocean') ? 'SEA' : t.name.includes('City') ? 'CITY' : 'NONE',
          boardType: pick([...hotelBoardTypes]),
          hasBalcony: themes.has('beach') && rand() < 0.4,
          hasTerrace: stars >= 4 && rand() < 0.25,
          hasKitchen: t.name.includes('Suite') && rand() < 0.3,
          hasJacuzzi: stars === 5 && rand() < 0.2,
          isAccessible: rand() < 0.15,
          smokingAllowed: false,
          bedCount: t.bed.startsWith('2 ') ? 2 : 1,
          floor: int(1, 20),
        });
        roomsMeta.push({ id: roomId, hotelId, providerId: getProviderId(primary), base: base * t.mult });

        for (const code of hotelProviders) {
          if (code === 'LOCAL') continue;
          roomMappings.push({
            id: randomUUID(), providerId: getProviderId(code), roomId,
            externalCode: `${mappingExternal[code]}-${t.code}`,
          });
        }

        for (let i = 0; i < DAYS; i++) {
          const date = dayDate(i);
          const dow = date.getUTCDay();
          const weekend = dow === 5 || dow === 6 ? 1.15 : 1; // viernes/sábado más caros
          const season = 1 + 0.18 * Math.sin((2 * Math.PI * (i + phase)) / 75); // temporadas
          const price = round2(base * t.mult * weekend * season * generateLogNormal(rand, 1, 0.12));
          const available = rand() < 0.08 ? 0 : int(1, t.maxUnits); // ~8% de noches cerradas
          inventory.push({ roomId, date, available, priceAmount: price, currency: 'USD' });
          if (available > 0 && (minPrice === null || price < minPrice)) minPrice = price;
        }
      }

      // Imágenes (placeholders estables por slug)
      for (let n = 0; n < 3; n++) {
        images.push({ hotelId, url: `https://picsum.photos/seed/${slug}-${n}/1200/800`, alt: `${title} - foto ${n + 1}`, position: n });
      }

      const popularityScore = Math.round(d.pop * 0.3 + stars * 8 + ratingAvg * 4 + rand() * 20);

      hotels.push({
        id: hotelId, slug, title, categoryStars: stars, status: 'ACTIVE',
        description: `${title}, ${stars} estrellas en ${d.name}.`,
        latitude: hotelLatitude,
        longitude: hotelLongitude,
        countryCode: d.country,
        regionCode: d.country,
        neighborhood: `${d.name} ${pick(['Centro', 'Norte', 'Sur', 'Zona Hotelera'])}`,
        zone: themes.has('beach') ? 'Coastal' : themes.has('city') ? 'Downtown' : 'Central',
        distanceToBeachMeters: themes.has('beach') ? (rand() < 0.5 ? int(50, 499) : int(500, 8_000)) : null,
        distanceToAirportKm: round2(1 + rand() * 50),
        distanceToCenterMeters: int(100, 10_000),
        distanceToSkiLiftMeters: themes.has('mountain') ? int(50, 5_000) : null,
        distanceToMetroMeters: themes.has('city') ? (rand() < 0.6 ? int(50, 999) : int(1_000, 5_000)) : null,
        propertyType: weighted<PropertyType>([
          ['HOTEL', 45], ['RESORT', 15], ['HOSTEL', 5], ['APARTMENT', 8], ['VILLA', 5],
          ['BOUTIQUE_HOTEL', 8], ['BED_AND_BREAKFAST', 4], ['MOTEL', 3], ['LODGE', 4], ['APARTHOTEL', 3],
        ]),
        chainBrand: chain ? regionChainBrand : null,
        isLuxury: stars === 5 || (stars === 4 && rand() < 0.15),
        isBoutique: rand() < 0.2,
        isChain: chain,
        yearBuilt: int(1960, 2020),
        yearRenovated: rand() < 0.4 ? int(2010, 2025) : null,
        totalRooms: chosen.reduce((sum, template) => sum + template.maxUnits, 0),
        ratingAvg,
        reviewCount: int(15, 3500),
        ratingCleanliness: round2(Math.min(9.9, ratingAvg + (rand() - 0.5))),
        ratingService: round2(Math.min(9.9, ratingAvg + (rand() - 0.5))),
        ratingLocation: round2(Math.min(9.9, ratingAvg + (rand() - 0.5))),
        ratingValue: round2(Math.min(9.9, ratingAvg + (rand() - 0.5))),
        popularityScore: popularityScore,
        bookingCount30d: int(0, 300),
        viewCount30d: int(0, 5_000),
        conversionRate30d: round2(rand() * 0.12),
        providerCount: hotelProviders.length,
        bestRateGuarantee: rand() < 0.7,
        priceFrom: minPrice, priceCurrency: 'USD', priceUpdatedAt: new Date(),
        priceBucket: priceBucketFor(minPrice),
        themes: [...themes],
        vibes,
        amenityCodes: [...codes],
        boardTypes: [...hotelBoardTypes],
        cancellationType: weighted<CancellationType>([['FREE', 55], ['PARTIAL', 25], ['NON_REFUNDABLE', 20]]),
        cancellationWindowHours: int(24, 168),
        paymentType: weighted<PaymentType>([['PREPAID', 45], ['AT_PROPERTY', 35], ['DEPOSIT', 20]]),
        minAge: themes.has('adults-only') ? 18 : 0,
        petsAllowed: codes.has('PET_FRIENDLY'),
        petsFee: codes.has('PET_FRIENDLY') ? round2(int(0, 50)) : null,
        childrenAllowed: !themes.has('adults-only'),
        checkInTime: '15:00',
        checkOutTime: '11:00',
        smokingAllowed: false,
        mainImageUrl: `https://picsum.photos/seed/${slug}-0/1200/800`,
        searchKey: normalize(`${title} ${d.name} ${d.code}`),
        destinationId: destId,
      });
      hotelsLite.push({ id: hotelId, popularityScore, destinationId: destId });
      // Trigger de flush cada HOTEL_BATCH_SIZE hoteles
      hotelsInBatch++;
      if (hotelsInBatch >= HOTEL_BATCH_SIZE) {
        await flushBatch();
        hotelsInBatch = 0;
        if (hotelsLite.length % 500 === 0) {
          console.log(`   ... ${hotelsLite.length} hoteles`);
        }
      }
    }
    await flushBatch();
    hotelsInBatch = 0;
    await markSeedStepComplete(prisma, 'hotels', destinationStep);
  };
  hotelsLite.length = 0;
  hotelsLite.push(...await prisma.hotel.findMany({
    select: { id: true, popularityScore: true, destinationId: true },
  }));
  console.log(
    `   ${hotelsLite.length} hoteles, ${roomsBuilt} habitaciones generadas en esta ejecución, ` +
    `${inventoryBuilt} noches insertadas`,
  );

  // 6) Usuarios: si el proceso se interrumpe, se rehace esta fase completa.
  const usersComplete = resume && await isSeedStepComplete(prisma, 'accounts', 'users');
  let users: { id: string; email: string; name: string | null; role: string }[];
  if (usersComplete) {
    users = await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true } });
  } else {
    if (resume) {
      await prisma.booking.deleteMany();
      await prisma.quote.deleteMany();
      await prisma.userEvent.deleteMany();
      await prisma.favorite.deleteMany();
      await prisma.user.deleteMany();
    }
    rand = createRandom(seedFor('users'));
    const generatedUsers: Prisma.UserCreateManyInput[] = [
      { id: randomUUID(), email: 'admin@agencia.test', name: 'Admin Agencia', role: 'ADMIN', emailVerified: new Date(), password: SEED_PASSWORD_HASH },
      { id: randomUUID(), email: 'agente@agencia.test', name: 'Agente Demo', role: 'AGENT', emailVerified: new Date(), password: SEED_PASSWORD_HASH },
    ];
    for (let i = 0; i < 60; i++) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      generatedUsers.push({
        id: randomUUID(),
        email: `${normalize(first)}.${normalize(last)}${i}@example.com`,
        name: `${first} ${last}`,
        role: 'CUSTOMER',
        emailVerified: rand() < 0.8 ? new Date() : null,
        password: SEED_PASSWORD_HASH,
      });
    }
    await prisma.user.createMany({ data: generatedUsers });
    await prisma.profile.createMany({
      data: generatedUsers.map((user) => ({
        id: randomUUID(),
        userId: String(user.id),
        phone: `+52 33 ${int(1000, 9999)} ${int(1000, 9999)}`,
        country: weighted<string>([['MX', 70], ['US', 10], ['CO', 8], ['ES', 6], ['AR', 6]]),
        currency: 'MXN',
      })),
    });
    await markSeedStepComplete(prisma, 'accounts', 'users');
    users = generatedUsers.map((user) => ({
      id: String(user.id),
      email: String(user.email),
      name: user.name ?? null,
      role: String(user.role),
    }));
  }
  const customers = users.filter((user) => user.role === 'CUSTOMER');
  const localProviderId = getProviderId('LOCAL');
  const dbRooms = await prisma.room.findMany({
    select: {
      id: true,
      hotelId: true,
      inventory: { orderBy: { date: 'asc' }, take: 1, select: { priceAmount: true } },
      mappings: { take: 1, select: { providerId: true } },
    },
  });
  roomsMeta.length = 0;
  for (const room of dbRooms) {
    const firstNight = room.inventory[0];
    if (!firstNight) throw new Error(`La habitación ${room.id} no tiene inventario para generar reservas.`);
    roomsMeta.push({
      id: room.id,
      hotelId: room.hotelId,
      providerId: room.mappings[0]?.providerId ?? localProviderId,
      base: Number(firstNight.priceAmount),
    });
  }

  // 7) Reservas históricas con ítems y bitácora (estados variados)
  const bookingsComplete = resume && await isSeedStepComplete(prisma, 'bookings', 'history');
  if (!bookingsComplete) {
    if (resume) await prisma.booking.deleteMany();
    rand = createRandom(seedFor('bookings'));
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
      const start = int(0, Math.max(0, DAYS - nights));
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
    await markSeedStepComplete(prisma, 'bookings', 'history');
  }

  // 8) Señales de comportamiento (recomendaciones) y favoritos
  // Los hoteles populares reciben más tráfico: índice = rand² => sesgo hacia el inicio
  const behaviorComplete = resume && await isSeedStepComplete(prisma, 'behavior', 'signals');
  const events: Prisma.UserEventCreateManyInput[] = [];
  if (!behaviorComplete) {
    if (resume) {
      await prisma.userEvent.deleteMany();
      await prisma.favorite.deleteMany();
    }
    rand = createRandom(seedFor('behavior'));
    const hotelsByPop = [...hotelsLite].sort((a, b) => b.popularityScore - a.popularityScore);
    const popularHotel = () => hotelsByPop[Math.floor(rand() * rand() * hotelsByPop.length)];
    const destByHotel = new Map(hotelsLite.map((hotel) => [hotel.id, hotel.destinationId]));

    for (let i = 0; i < EVENT_COUNT; i++) {
      const type = weighted<'SEARCH' | 'HOTEL_VIEW' | 'CART_ADD' | 'CHECKOUT_START' | 'BOOKED'>([
        ['SEARCH', 35], ['HOTEL_VIEW', 45], ['CART_ADD', 10], ['CHECKOUT_START', 6], ['BOOKED', 4],
      ]);
      const isUser = rand() < 0.5;
      const createdAt = new Date(Date.now() - int(0, 30 * 86_400_000));
      if (type === 'SEARCH') {
        const destination = pick(destRows);
        events.push({
          id: randomUUID(), type, createdAt, destinationId: destination.id, query: destination.name,
          userId: isUser ? pick(customers).id : null,
          anonymousId: isUser ? null : `anon-${int(1, 400)}`,
        });
      } else {
        const hotel = popularHotel();
        events.push({
          id: randomUUID(), type, createdAt, hotelId: hotel.id,
          destinationId: destByHotel.get(hotel.id),
          userId: isUser ? pick(customers).id : null,
          anonymousId: isUser ? null : `anon-${int(1, 400)}`,
        });
      }
    }
    await inChunks(events, (chunk) => prisma.userEvent.createMany({ data: chunk, skipDuplicates: true }));

    const favorites: Prisma.FavoriteCreateManyInput[] = [];
    for (const user of customers) {
      const ids = new Set<string>();
      for (let n = int(0, 6); n > 0; n--) ids.add(popularHotel().id);
      ids.forEach((hotelId) => favorites.push({ userId: user.id, hotelId }));
    }
    await prisma.favorite.createMany({ data: favorites, skipDuplicates: true });
    await markSeedStepComplete(prisma, 'behavior', 'signals');
  }

  // 9) Resumen
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const [totalRooms, totalInventory] = await Promise.all([
    prisma.room.count(),
    prisma.roomInventory.count(),
  ]);
  console.log(
    `✅ Listo en ${secs}s · ${destRows.length} destinos · ${hotelsLite.length} hoteles · ` +
      `${totalRooms} habitaciones · ${totalInventory} noches · ${users.length} usuarios · ` +
      `${await prisma.booking.count()} reservas · ${await prisma.userEvent.count()} eventos`,
  );

  if (process.env.SEED_BENCHMARK === '1') {
    console.log('\n📊 Benchmark de búsquedas:');
    const cases = [
      { label: 'Destino + estrellas', q: `SELECT id FROM "Hotel" WHERE "destinationId" = $1 AND "status" = 'ACTIVE' AND "categoryStars" >= 4 LIMIT 20`, params: [destRows[0].id] },
      { label: 'Precio ordenado', q: `SELECT id FROM "Hotel" WHERE "status" = 'ACTIVE' ORDER BY "priceFrom" ASC NULLS LAST LIMIT 20`, params: [] },
      { label: 'Trigram searchKey', q: `SELECT id FROM "Hotel" WHERE "searchKey" LIKE $1 LIMIT 20`, params: ['%cancun%'] },
      { label: 'Popularidad descendente', q: `SELECT id FROM "Hotel" WHERE "status" = 'ACTIVE' ORDER BY "popularityScore" DESC, id ASC LIMIT 20`, params: [] },
    ];
    for (const c of cases) {
      const t = Date.now();
      const r = await prisma.$queryRawUnsafe(c.q, ...c.params) as unknown[];
      console.log(`   ${c.label.padEnd(28)} ${Date.now() - t}ms  (${r.length} filas)`);
    }
    console.log('\n   Corré EXPLAIN ANALYZE para ver el plan de ejecución.');
  }
  
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      await pool.end();
    }
  });