import { afterAll, describe, expect, it } from 'vitest';
import { testPrisma, disconnectTestDb } from './helpers/db';
import { createEphemeralHotel } from './helpers/fixtures';

describe('smoke — infraestructura de tests', () => {
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('reutiliza el seed existente sin tocarlo', async () => {
    // Verifica que el seed esté poblado: si está vacío, hay que correr `npm run seed`
    const hotelCount = await testPrisma.hotel.count();
    expect(hotelCount).toBeGreaterThan(0);
  });

  it('crea y destruye un fixture aislado sin tocar el resto', async () => {
    const before = await testPrisma.hotel.count();
    const fixture = await createEphemeralHotel({ nights: 3, price: '100.00' });

    const during = await testPrisma.hotel.count();
    expect(during).toBe(before + 1);

    await fixture.cleanup();

    const after = await testPrisma.hotel.count();
    expect(after).toBe(before);
  });

  it('la suma de Decimal usa .add() sin perder precisión', async () => {
    const { Prisma } = await import('../prisma/generated/client');
    const fixture = await createEphemeralHotel({ nights: 3, price: '99.99' });

    try {
      const rows = await testPrisma.roomInventory.findMany({
        where: { roomId: fixture.roomId },
        orderBy: { date: 'asc' },
      });
      const total = rows.reduce((acc, r) => acc.add(r.priceAmount), new Prisma.Decimal(0));
      expect(total.toString()).toBe('299.97');
    } finally {
      await fixture.cleanup();
    }
  });
});