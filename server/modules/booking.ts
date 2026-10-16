import { builder } from '../builder';
import { requireRole } from '../auth-guards';

import { GraphQLError } from 'graphql';
import { createRuntimeProviderRouter, providerCodeFor } from '../providers/router';
// ─────────────────────────────────────────────────────────────
// Los campos personales del huésped no se exponen en el tipo GraphQL.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// LÍMITES
// ─────────────────────────────────────────────────────────────
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

const MAX_BOOKING_PAGE_SIZE = 50;

builder.queryField('myBookings', (t) =>
  t.prismaField({
    type: ['Booking'],
    args: {
      first: t.arg.int({ required: false, defaultValue: 20 }),
      skip: t.arg.int({ required: false, defaultValue: 0 }),
    },
    resolve: (query, _root, args, ctx) => {
      const user = requireRole(ctx, ['CUSTOMER', 'AGENT', 'ADMIN']);
      return ctx.prisma.booking.findMany({
        ...query,
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(args.first ?? 20, 1), MAX_BOOKING_PAGE_SIZE),
        skip: Math.max(args.skip ?? 0, 0),
      });
    },
  }),
);

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
      const room = await ctx.prisma.room.findUniqueOrThrow({
        where: { id: args.roomId },
        select: {
          mappings: {
            where: { provider: { isActive: true } },
            select: { providerId: true },
            take: 1,
          },
        },
      });
      const mapping = room.mappings[0];
      if (!mapping) badInput('La habitación no tiene proveedor asociado');
      const providerCode = await providerCodeFor(ctx.prisma, mapping.providerId);
      const router = createRuntimeProviderRouter(ctx.prisma);
      const quote = await router.createQuote(providerCode, {
        ...args,
        userId: ctx.user?.id ?? null,
        anonymousId: ctx.user ? null : ctx.anonymousId,
      });
      return ctx.prisma.quote.findUniqueOrThrow({
        where: { id: quote.id },
        ...query,
      });
    },
  }),
);

builder.mutationField('createBooking', (t) =>
  t.prismaField({
    type: 'Booking',
    args: {
      quoteId: t.arg.string({ required: true }),
      idempotencyKey: t.arg.string({ required: true }),
      guestName: t.arg.string({ required: true }),
      guestEmail: t.arg.string({ required: true }),
      guestPhone: t.arg.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const existing = await ctx.prisma.booking.findUnique({
        where: { idempotencyKey: args.idempotencyKey },
        ...query,
      });
      if (existing) return existing;

      const quote = await ctx.prisma.quote.findUniqueOrThrow({
        where: { id: args.quoteId },
        select: { providerId: true },
      });
      const providerCode = await providerCodeFor(ctx.prisma, quote.providerId);
      const router = createRuntimeProviderRouter(ctx.prisma);
      const booking = await router.createBooking(providerCode, {
        ...args,
        guestPhone: args.guestPhone ?? null,
        userId: ctx.user?.id ?? null,
      });
      return ctx.prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        ...query,
      });
    },
  }),
);