import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testPrisma } from './helpers/db';
import { createEphemeralHotel } from './helpers/fixtures';
import { loadBookingByReference } from '../features/booking/server/loadBookingByReference';

// Guardamos el cleanup del fixture activo para invocarlo en afterEach.
// El fixture NO se exporta como `cleanup` — vive en el objeto que devuelve
// createEphemeralHotel y solo borra SU fixture (bookings, quotes, room, hotel, destino).
let pendingCleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (pendingCleanup) {
    await pendingCleanup();
    pendingCleanup = null;
  }
});

async function seedBooking() {
  const fx = await createEphemeralHotel({ nights: 2, price: '100' });
  pendingCleanup = fx.cleanup;

  const reference = `TEST-${randomUUID().slice(0, 8)}`;

  const booking = await testPrisma.booking.create({
    data: {
      reference,
      status: 'CONFIRMED',
      guestName: 'Ada Lovelace',
      guestEmail: 'ada@example.com',
      guestPhone: null,
      totalAmount: '200.00',
      currency: 'USD',
      idempotencyKey: `idem-${randomUUID()}`,
      items: {
        create: [
          {
            hotelId: fx.hotelId,
            roomId: fx.roomId,
            providerId: fx.providerId,
            checkIn: new Date('2026-03-01'),
            checkOut: new Date('2026-03-03'),
            adults: 2,
            childrenAges: [],
            priceAmount: '200.00',
            currency: 'USD',
          },
        ],
      },
      events: {
        create: [
          { type: 'CONFIRMED', createdAt: new Date('2026-02-01T10:05:00Z') },
          { type: 'CREATED',   createdAt: new Date('2026-02-01T10:00:00Z') },
        ],
      },
    },
  });

  // 👇 CLAVE: registramos el booking en el tracker del fixture.
  //    Sin esto, el cleanup NO lo borra (solo borra los que pasan por
  //    fx.track.booking) y queda huérfano, ensuciando la DB.
  fx.track.booking(booking.id);

  return { reference };
}

describe('loadBookingByReference', () => {
  it('devuelve null para referencia inexistente', async () => {
    const r = await loadBookingByReference(testPrisma, 'NO-EXISTE');
    expect(r).toBeNull();
  });

  it('devuelve null para referencia vacía', async () => {
    const r = await loadBookingByReference(testPrisma, '');
    expect(r).toBeNull();
  });

  it('mapea el booking al DTO esperado', async () => {
    const { reference } = await seedBooking();
    const dto = await loadBookingByReference(testPrisma, reference);

    expect(dto).not.toBeNull();
    expect(dto!.reference).toBe(reference);
    expect(dto!.status).toBe('CONFIRMED');
    expect(dto!.guestEmail).toBe('ada@example.com');
    expect(dto!.totalAmount).toBe('200');
    expect(dto!.currency).toBe('USD');
    expect(dto!.items).toHaveLength(1);
    expect(dto!.items[0].checkIn).toBe('2026-03-01');
    expect(dto!.items[0].checkOut).toBe('2026-03-03');
    expect(dto!.items[0].priceAmount).toBe('200');
    expect(dto!.items[0].roomName).toBeTruthy();
    expect(dto!.items[0].hotelTitle).toBeTruthy();
  });

  it('ordena los eventos por createdAt asc', async () => {
    const { reference } = await seedBooking();
    const dto = await loadBookingByReference(testPrisma, reference);
    expect(dto!.events.map((e) => e.type)).toEqual(['CREATED', 'CONFIRMED']);
  });
});