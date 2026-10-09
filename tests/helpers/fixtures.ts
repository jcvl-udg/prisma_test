import { randomUUID } from 'node:crypto';
import { testPrisma } from './db';

// Crea un hotel "sandbox" con su destino, room, inventario y mapping.
// Todo con IDs propios: no toca el seed existente.
// Devuelve también la función de cleanup.
export async function createEphemeralHotel(opts: { nights: number; price: string }) {
  const suffix = randomUUID().slice(0, 8);
  const createdIds: { quotes: string[]; bookings: string[] } = { quotes: [], bookings: [] };

  const provider = await testPrisma.provider.upsert({
    where: { code: 'LOCAL' },
    create: { id: randomUUID(), code: 'LOCAL', name: 'Local' },
    update: {},
  });

  const destination = await testPrisma.destination.create({
    data: {
      slug: `test-dest-${suffix}`,
      name: `Test Dest ${suffix}`,
      countryCode: 'MX',
      themes: [],
      searchKey: `test ${suffix}`,
    },
  });

  const hotel = await testPrisma.hotel.create({
    data: {
      slug: `test-hotel-${suffix}`,
      title: `Test Hotel ${suffix}`,
      categoryStars: 4,
      status: 'ACTIVE',
      searchKey: `test ${suffix}`,
      destinationId: destination.id,
    },
  });

  const room = await testPrisma.room.create({
    data: {
      hotelId: hotel.id,
      name: 'Standard',
      code: 'STD',
      maxAdults: 2,
      maxChildren: 1,
    },
  });

  await testPrisma.roomMapping.create({
    data: {
      providerId: provider.id,
      roomId: room.id,
      externalCode: `TEST-${suffix}`,
    },
  });

  const base = new Date('2030-06-15T00:00:00Z'); // futuro lejano: cero colisión con seed
  for (let i = 0; i < opts.nights; i++) {
    await testPrisma.roomInventory.create({
      data: {
        roomId: room.id,
        date: new Date(base.getTime() + i * 86_400_000),
        available: 5,
        priceAmount: opts.price,
        currency: 'USD',
      },
    });
  }

  const checkIn = base;
  const checkOut = new Date(base.getTime() + opts.nights * 86_400_000);

  return {
    providerId: provider.id,
    destinationId: destination.id,
    hotelId: hotel.id,
    roomId: room.id,
    checkIn,
    checkOut,

    // Registra IDs para cleanup
    track: { quote: (id: string) => createdIds.quotes.push(id), booking: (id: string) => createdIds.bookings.push(id) },

    async cleanup() {
      // Orden importa por las FKs:
      // 1) Booking (cascade borra BookingItem + BookingEvent)
      if (createdIds.bookings.length) {
        await testPrisma.booking.deleteMany({ where: { id: { in: createdIds.bookings } } });
      }
      // 2) Quotes
      if (createdIds.quotes.length) {
        await testPrisma.quote.deleteMany({ where: { id: { in: createdIds.quotes } } });
      }
      // 3) BookingItems por si quedaron huérfanos (los creamos con track)
      await testPrisma.bookingItem.deleteMany({ where: { roomId: room.id } });
      // 4) Cualquier Quote generada en los tests para este room
      await testPrisma.quote.deleteMany({ where: { roomId: room.id } });
      // 5) Room cascada borra RoomInventory + RoomMapping
      await testPrisma.room.delete({ where: { id: room.id } });
      // 6) Hotel cascada borra HotelImage, HotelAmenity, ProviderMapping
      await testPrisma.hotel.delete({ where: { id: hotel.id } });
      // 7) Destino
      await testPrisma.destination.delete({ where: { id: destination.id } });
    },
  };
}