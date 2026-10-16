export const SEED_PROFILES = {
  dev: { hotels: 1_000, days: 60, events: 2_000 },
  demo: { hotels: 3_000, days: 90, events: 10_000 },
  stress: { hotels: 10_000, days: 90, events: 50_000 },
} as const;

export type SeedProfile = keyof typeof SEED_PROFILES;

export interface SeedConfig {
  profile: SeedProfile;
  hotels: number;
  days: number;
  events: number;
}

export interface SeedEnvironment {
  SEED_PROFILE?: string;
  SEED_SCALE?: string;
  SEED_DAYS?: string;
}

export interface SeedDestination {
  code: string;
  popularity: number;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} debe ser un entero positivo.`);
  }
  return parsed;
}

export function getSeedConfig(env: SeedEnvironment): SeedConfig {
  const profileName = env.SEED_PROFILE ?? 'dev';
  if (!Object.hasOwn(SEED_PROFILES, profileName)) {
    throw new Error(
      `SEED_PROFILE inválido: "${profileName}". Valores permitidos: ${Object.keys(SEED_PROFILES).join(', ')}.`,
    );
  }

  const profile = profileName as SeedProfile;
  const defaults = SEED_PROFILES[profile];
  const scale = env.SEED_SCALE === undefined ? 1 : Number(env.SEED_SCALE);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('SEED_SCALE debe ser un número positivo.');
  }
  const hotels = Math.round(defaults.hotels * scale);
  if (!Number.isSafeInteger(hotels) || hotels <= 0) {
    throw new Error('SEED_SCALE debe producir una cantidad segura y positiva de hoteles.');
  }

  return {
    profile,
    hotels,
    days: env.SEED_DAYS === undefined ? defaults.days : positiveInteger(env.SEED_DAYS, 'SEED_DAYS'),
    events: defaults.events,
  };
}

export function allocateCounts(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || weights.length === 0) {
    throw new Error('Se requiere un total entero no negativo y al menos un peso.');
  }
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    throw new Error('Todos los pesos de distribución deben ser positivos.');
  }

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(weightTotal)) {
    throw new Error('La suma de los pesos de distribución debe ser finita.');
  }
  const exactCounts = weights.map((weight) => (total * weight) / weightTotal);
  const counts = exactCounts.map(Math.floor);
  let remainder = total - counts.reduce((sum, count) => sum + count, 0);
  const byRemainder = exactCounts
    .map((count, index) => ({ index, remainder: count - counts[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of byRemainder) {
    if (remainder-- <= 0) break;
    counts[index]++;
  }

  return counts;
}

export function allocateHotelCounts(total: number, destinations: SeedDestination[]): number[] {
  if (destinations.length === 0 || destinations.some(({ popularity }) => !Number.isFinite(popularity) || popularity <= 0)) {
    throw new Error('Cada destino necesita una popularidad positiva para distribuir hoteles.');
  }
  return allocateCounts(
    total,
    destinations.map(({ code, popularity }) => (14 + popularity / 4) * (code === 'CUN' ? 1.5 : 1)),
  );
}
