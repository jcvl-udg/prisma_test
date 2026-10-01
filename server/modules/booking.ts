import { builder } from '../builder';

// ─────────────────────────────────────────────────────────────
// Por ahora este módulo SOLO define tipos. No hay queries ni mutations:
//   - createBooking se reescribe completo en la Tarea 6
//     (cotización, idempotencia, transacción, estados)
//   - consultar reservas requiere sesión (Tarea 3)
// Los datos personales del huésped (nombre, correo, teléfono) NO se exponen
// todavía: se añadirán junto con las reglas de autorización.
// ─────────────────────────────────────────────────────────────

builder.prismaObject('Booking', {
  fields: (t) => ({
    id: t.exposeID('id'),
    reference: t.exposeString('reference'),
    status: t.string({ resolve: (b) => b.status }), // enum de Prisma -> String
    totalAmount: t.string({ resolve: (b) => b.totalAmount.toString() }),
    currency: t.exposeString('currency'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    expiresAt: t.expose('expiresAt', { type: 'DateTime', nullable: true }),
    items: t.relation('items'),
  }),
});

builder.prismaObject('BookingItem', {
  fields: (t) => ({
    id: t.exposeID('id'),
    hotel: t.relation('hotel'),
    room: t.relation('room'),
    checkIn: t.expose('checkIn', { type: 'Date' }),
    checkOut: t.expose('checkOut', { type: 'Date' }),
    adults: t.exposeInt('adults'),
    childrenAges: t.exposeIntList('childrenAges'),
    priceAmount: t.string({ resolve: (i) => i.priceAmount.toString() }),
    currency: t.exposeString('currency'),
    status: t.string({ resolve: (i) => i.status }),
  }),
});
