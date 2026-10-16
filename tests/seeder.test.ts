import { describe, expect, it } from 'vitest';
import { allocateCounts, allocateHotelCounts, getSeedConfig } from '../prisma/seed-lib/config';
import {
  buildAmenityCodes,
  createRandom,
  logNormal,
  priceBucketFor,
  weightedPick,
} from '../prisma/seed-lib/generators';
import { encodeCopyTextField } from '../prisma/seed-lib/copy-helper';

describe('configuración del seeder', () => {
  it('usa el perfil dev por defecto y conserva los overrides anteriores', () => {
    expect(getSeedConfig({})).toEqual({ profile: 'dev', hotels: 1_000, days: 60, events: 2_000 });
    expect(getSeedConfig({ SEED_PROFILE: 'demo', SEED_DAYS: '30', SEED_SCALE: '2' })).toEqual({
      profile: 'demo',
      hotels: 6_000,
      days: 30,
      events: 10_000,
    });
  });

  it('define correctamente los perfiles demo y stress', () => {
    expect(getSeedConfig({ SEED_PROFILE: 'demo' })).toEqual({
      profile: 'demo',
      hotels: 3_000,
      days: 90,
      events: 10_000,
    });
    expect(getSeedConfig({ SEED_PROFILE: 'stress' })).toEqual({
      profile: 'stress',
      hotels: 10_000,
      days: 90,
      events: 50_000,
    });
  });

  it.each([
    [{ SEED_PROFILE: 'unknown' }, /SEED_PROFILE inválido/],
    [{ SEED_DAYS: '0' }, /SEED_DAYS/],
    [{ SEED_DAYS: '1.5' }, /SEED_DAYS/],
    [{ SEED_SCALE: '-1' }, /SEED_SCALE/],
  ])('rechaza configuración inválida %j', (env, error) => {
    expect(() => getSeedConfig(env)).toThrow(error);
  });

  it('distribuye un total exacto con restos deterministas', () => {
    expect(allocateCounts(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocateCounts(1_000, [10, 20, 30]).reduce((sum, count) => sum + count, 0)).toBe(1_000);
  });

  it('asigna más de 50 hoteles a Cancún con el perfil dev', () => {
    const destinations = [
      ...Array.from({ length: 28 }, (_, index) => ({ code: `D${index}`, popularity: 60 })),
      { code: 'CUN', popularity: 95 },
    ];
    expect(allocateHotelCounts(1_000, destinations)[28]).toBeGreaterThan(50);
  });
});

describe('generadores de datos', () => {
  it('asigna los cuatro buckets de precio y rechaza valores inválidos', () => {
    expect([50, 100, 200, 350].map(priceBucketFor)).toEqual([
      'BUDGET', 'MID_RANGE', 'PREMIUM', 'LUXURY',
    ]);
    expect(priceBucketFor(null)).toBeNull();
    expect(() => priceBucketFor(-1)).toThrow(/precio/);
  });

  it('escapa campos COPY de PostgreSQL y fechas en UTC', () => {
    expect(encodeCopyTextField('a\\b\tc\nd\re')).toBe('a\\\\b\\tc\\nd\\re');
    expect(encodeCopyTextField(null)).toBe('\\N');
    expect(encodeCopyTextField(new Date('2026-10-16T00:00:00.000Z'))).toBe('2026-10-16');
  });

  it('produce una distribución ponderada de estrellas dentro de tolerancia', () => {
    const random = createRandom(20261017);
    const stars: [number, number][] = [[2, 8], [3, 32], [4, 40], [5, 20]];
    const counts = new Map(stars.map(([star]) => [star, 0]));
    const sampleSize = 20_000;

    for (let i = 0; i < sampleSize; i++) {
      const star = weightedPick(random, stars);
      counts.set(star, (counts.get(star) ?? 0) + 1);
    }

    for (const [star, weight] of stars) {
      expect(Math.abs((counts.get(star)! / sampleSize) - weight / 100)).toBeLessThanOrEqual(0.05);
    }
  });

  it('mantiene las proporciones de amenidades y el rango por hotel', () => {
    const random = createRandom(20261018);
    const samples = 10_000;
    let fiveStarSpa = 0;
    let fiveStarPool = 0;
    let fiveStarRestaurant = 0;
    let fourStarSpa = 0;
    let fourStarPool = 0;
    let fourStarGym = 0;

    for (let i = 0; i < samples; i++) {
      const fiveStar = buildAmenityCodes(random, 5, new Set(['beach', 'family']), ['beach'], [
        'WIFI', 'AC', 'RESTAURANT', 'POOL', 'GYM', 'SPA', 'BAR', 'PET_FRIENDLY',
        'BREAKFAST', 'BUSINESS_CENTER', 'AIRPORT_SHUTTLE', 'PARKING', 'KIDS_CLUB',
      ]);
      const fourStar = buildAmenityCodes(random, 4, new Set(['city']), ['city'], [
        'WIFI', 'AC', 'RESTAURANT', 'POOL', 'GYM', 'SPA', 'BAR', 'PET_FRIENDLY',
        'BREAKFAST', 'BUSINESS_CENTER', 'AIRPORT_SHUTTLE', 'PARKING', 'KIDS_CLUB',
      ]);
      fiveStarSpa += Number(fiveStar.has('SPA'));
      fiveStarPool += Number(fiveStar.has('POOL'));
      fiveStarRestaurant += Number(fiveStar.has('RESTAURANT'));
      fourStarSpa += Number(fourStar.has('SPA'));
      fourStarPool += Number(fourStar.has('POOL'));
      fourStarGym += Number(fourStar.has('GYM'));
      expect(fiveStar.size).toBeGreaterThanOrEqual(4);
      expect(fiveStar.size).toBeLessThanOrEqual(12);
      expect(fourStar.size).toBeGreaterThanOrEqual(4);
      expect(fourStar.size).toBeLessThanOrEqual(12);
    }

    expect(fiveStarSpa / samples).toBeGreaterThan(0.85);
    expect(fiveStarPool / samples).toBeGreaterThan(0.9);
    expect(fiveStarRestaurant / samples).toBeGreaterThan(0.85);
    expect(fourStarSpa / samples).toBeGreaterThan(0.35);
    expect(fourStarPool / samples).toBeGreaterThan(0.65);
    expect(fourStarGym / samples).toBeGreaterThan(0.55);
  });

  it('genera la misma secuencia y precios log-normales positivos', () => {
    const firstRandom = createRandom(42);
    const secondRandom = createRandom(42);
    const first = Array.from({ length: 100 }, () => logNormal(firstRandom, 1, 0.12));
    const second = Array.from({ length: 100 }, () => logNormal(secondRandom, 1, 0.12));

    expect(first).toEqual(second);
    expect(first.every((value) => value > 0 && Number.isFinite(value))).toBe(true);
  });
});
