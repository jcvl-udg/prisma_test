export type RandomSource = () => number;

export type PriceBucket = 'BUDGET' | 'MID_RANGE' | 'PREMIUM' | 'LUXURY';

export function priceBucketFor(price: number | null): PriceBucket | null {
  if (price === null) return null;
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('El precio debe ser finito y no negativo para asignar un bucket.');
  }
  if (price < 75) return 'BUDGET';
  if (price < 150) return 'MID_RANGE';
  if (price < 300) return 'PREMIUM';
  return 'LUXURY';
}

export function createRandom(seed: number): RandomSource {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function weightedPick<T>(random: RandomSource, items: [T, number][]): T {
  if (items.length === 0 || items.some(([, weight]) => !Number.isFinite(weight) || weight <= 0)) {
    throw new Error('La selección ponderada requiere opciones con pesos positivos.');
  }

  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let value = random() * total;
  for (const [item, weight] of items) {
    value -= weight;
    if (value < 0) return item;
  }
  return items[items.length - 1][0];
}

export function buildAmenityCodes(
  random: RandomSource,
  stars: number,
  themes: Set<string>,
  destinationThemes: string[],
  catalogCodes: string[],
): Set<string> {
  const codes = new Set(['WIFI']);
  if (stars >= 3) codes.add('AC');
  if (stars >= 3 && random() < (stars === 5 ? 0.9 : 0.7)) codes.add('RESTAURANT');
  if (stars >= 4 && random() < (stars === 5 ? 0.95 : 0.7)) codes.add('POOL');
  if (stars >= 4 && random() < (stars === 5 ? 0.8 : 0.6)) codes.add('GYM');
  if (stars === 5 && random() < 0.9) codes.add('SPA');
  if (stars === 4 && random() < 0.4) codes.add('SPA');
  if (stars === 5 && random() < 0.8) codes.add('ROOM_SERVICE');
  if (stars >= 4) codes.add('BAR');

  const optional: [string, boolean][] = [
    ['BEACHFRONT', themes.has('beach') && random() < 0.5],
    ['ALL_INCLUSIVE', destinationThemes.includes('all-inclusive') && random() < 0.4],
    ['KIDS_CLUB', themes.has('family') && random() < 0.5],
    ['GOLF', destinationThemes.includes('golf') && random() < 0.4],
    ['BUSINESS_CENTER', themes.has('city') && random() < 0.4],
    ['PET_FRIENDLY', random() < 0.2],
    ['PARKING', random() < 0.4],
    ['AIRPORT_SHUTTLE', random() < 0.3],
    ['ACCESSIBLE', random() < 0.5],
    ['BREAKFAST', random() < 0.6],
  ];
  for (const [code, include] of optional) {
    if (include && codes.size < 12) codes.add(code);
  }

  const targetSize = Math.max(codes.size, Math.min(12, 4 + Math.floor(random() * 9)));
  while (codes.size < targetSize) {
    const index = Math.floor(random() * catalogCodes.length);
    const code = catalogCodes[index];
    if (!code) throw new Error('El catálogo de amenidades no puede estar vacío.');
    codes.add(code);
  }

  return codes;
}

export function logNormal(random: RandomSource, mean: number, standardDeviation: number): number {
  if (!Number.isFinite(mean) || mean <= 0 || !Number.isFinite(standardDeviation) || standardDeviation < 0) {
    throw new Error('La distribución log-normal requiere media positiva y desviación no negativa.');
  }

  let first = 0;
  while (first === 0) first = random();
  const normal = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * random());
  return Math.exp(Math.log(mean) - (standardDeviation ** 2) / 2 + standardDeviation * normal);
}
