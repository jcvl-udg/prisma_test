import { builder } from '../builder';

import { GraphQLError } from 'graphql';
import { Prisma } from '../../prisma/generated/client';
// ─────────────────────────────────────────────────────────────
// Por ahora este módulo SOLO define tipos. No hay queries ni mutations:
//   - createBooking se reescribe completo en la Tarea 6
//     (cotización, idempotencia, transacción, estados)
//   - consultar reservas requiere sesión (Tarea 3)
// Los datos personales del huésped (nombre, correo, teléfono) NO se exponen
// todavía: se añadirán junto con las reglas de autorización.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// LÍMITES
// ─────────────────────────────────────────────────────────────
const MAX_STAY_NIGHTS = 30;
const QUOTE_TTL_MS = 30 * 60_000; // 30 minutos

function badInput(message: string): never {
  throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

builder.prismaObject('Quote', {
  fields: (t) => ({
    id: t.exposeID('id'),
    hotelId: t.exposeID('hotelId'),
    roomId: t.exposeID('roomId'),
    checkIn: t.expose('checkIn', { type: 'Date' }),
    checkOut: t.expose('checkOut', { type: 'Date' }),
    adults: t.exposeInt('adults'),
    childrenAges: t.exposeIntList('childrenAges'),
    // Decimal -> String (misma convención que Hotel.priceFrom)
    priceAmount: t.string({ resolve: (q) => q.priceAmount.toString() }),
    currency: t.exposeString('currency'),
    providerRateKey: t.exposeString('providerRateKey', { nullable: true }),
    expiresAt: t.expose('expiresAt', { type: 'DateTime' }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    hotel: t.relation('hotel'),
    room: t.relation('room'),
  }),
});

builder.prismaObject('Booking', {
  fields: (t) => ({
    id: t.exposeID('id'),
    reference: t.exposeString('reference'),
    status: t.string({ resolve: (b) => b.status }),
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

// ─────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────

builder.mutationField('createQuote', (t) =>
  t.prismaField({
    type: 'Quote',
    args: {
      hotelId: t.arg.string({ required: true }),
      roomId: t.arg.string({ required: true }),
      checkIn: t.arg({ type: 'Date', required: true }),
      checkOut: t.arg({ type: 'Date', required: true }),
      adults: t.arg.int({ required: true }),
      childrenAges: t.arg.intList({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { checkIn, checkOut } = args;

      // ── Validaciones de fechas ─────────────────────────────
      if (checkOut <= checkIn) {
        badInput('La fecha de salida debe ser posterior a la de entrada');
      }
      const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
      if (nights > MAX_STAY_NIGHTS) {
        badInput(`La estancia máxima es de ${MAX_STAY_NIGHTS} noches`);
      }

      // ── Validaciones de ocupación ──────────────────────────
      if (args.adults < 1) badInput('Se requiere al menos 1 adulto');
      if (args.childrenAges.some((age) => age < 0 || age > 17)) {
        badInput('La edad de los niños debe estar entre 0 y 17 años');
      }

      // ── Validaciones de catálogo ───────────────────────────
      const room = await ctx.prisma.room.findUniqueOrThrow({
        where: { id: args.roomId },
        include: { mappings: true },
      });

      if (room.hotelId !== args.hotelId) {
        badInput('La habitación no pertenece al hotel indicado');
      }
      if (args.adults > room.maxAdults) {
        badInput(`Esta habitación admite máximo ${room.maxAdults} adultos`);
      }
      if (args.childrenAges.length > room.maxChildren) {
        badInput(`Esta habitación admite máximo ${room.maxChildren} niños`);
      }

      const mapping = room.mappings[0];
      if (!mapping) {
        badInput('La habitación no tiene proveedor asociado');
      }

      // ── Disponibilidad noche a noche ───────────────────────
      const inventory = await ctx.prisma.roomInventory.findMany({
        where: {
          roomId: room.id,
          date: { gte: checkIn, lt: checkOut },
          available: { gt: 0 },
        },
        orderBy: { date: 'asc' },
      });

      if (inventory.length !== nights) {
        badInput(
          `Sin disponibilidad en todas las noches solicitadas (${inventory.length}/${nights})`,
        );
      }

      // ── Precio: SIEMPRE desde el servidor, con Decimal ─────
      const total = inventory.reduce(
        (acc, row) => acc.add(row.priceAmount),
        new Prisma.Decimal(0),
      );
      const currency = inventory[0].currency;

      // ── Persistir la cotización ────────────────────────────
      return ctx.prisma.quote.create({
        ...query,
        data: {
          userId: ctx.user?.id ?? null,
          anonymousId: ctx.user ? null : ctx.anonymousId,
          hotelId: room.hotelId,
          roomId: room.id,
          providerId: mapping.providerId,
          checkIn,
          checkOut,
          adults: args.adults,
          childrenAges: args.childrenAges,
          priceAmount: total,
          currency,
          providerRateKey: null, // Fase 4: vendrá del proveedor externo
          expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
        },
      });
    },
  }),
);