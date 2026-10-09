import { randomUUID } from 'node:crypto';
import { testPrisma } from './db';

// Dataset mínimo y determinista para tests. NO usa el seed completo.
// Esto es lo que hace que los tests corran en <100ms en lugar de 30s.
export async function seedMinimal() {
  const provider = await testPrisma.provider.create({
    data: { id: randomUUID(), code: 'LOCAL', name: 'Test Local' },
  });

  const destination = await testPrisma.destination.create({
    data: {
      id: randomUUID(),
      slug: 'test-cancun',
      name: 'Test Cancún',
      code: 'CUN',
      countryCode: 'MX',
      themes: ['beach'],
      searchKey: 'test cancun cun',
    },
  });

  const hotel = await testPrisma.hotel.create({
    data: {
      id: randomUUID(),
      slug: 'test-hotel',
      title: 'Test Hotel',
      categoryStars: 4,
      status: 'ACTIVE',
      searchKey: 'test hotel cancun',
      destinationId: destination.id,
    },
  });

  const room = await testPrisma.room.create({
    data: {
      id: randomUUID(),
      hotelId: hotel.id,
      name: 'Standard',
      code: 'STD',
      maxAdults: 2,
      maxChildren: 1,
    },
  });

  await testPrisma.roomMapping.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      roomId: room.id,
      externalCode: 'TEST-STD',
    },
  });

  // 3 noches a 100 USD cada una, todas disponibles
  const base = new Date('2026-11-15T00:00:00Z');
  for (let i = 0; i < 3; i++) {
    const date = new Date(base.getTime() + i * 86_400_000);
    await testPrisma.roomInventory.create({
      data: {
        roomId: room.id,
        date,
        available: 5,
        priceAmount: '100.00',
        currency: 'USD',
      },
    });
  }

  return {
    providerId: provider.id,
    destinationId: destination.id,
    hotelId: hotel.id,
    roomId: room.id,
  };
}