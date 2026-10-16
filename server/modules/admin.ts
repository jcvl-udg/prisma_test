import { GraphQLError } from 'graphql';
import { Prisma } from '../../prisma/generated/client';
import { builder } from '../builder';
import { requireRole } from '../auth-guards';
import { normalize } from '../../lib/text';

const MAX_BOOKING_PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

const AdminBookingStatus = builder.enumType('AdminBookingStatus', {
  values: ['PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED', 'EXPIRED'] as const,
});

const AdminBookingSort = builder.enumType('AdminBookingSort', {
  values: ['CREATED_DESC', 'CREATED_ASC', 'TOTAL_DESC', 'TOTAL_ASC'] as const,
});

const AdminBookingTransition = builder.enumType('AdminBookingTransition', {
  values: ['CONFIRM', 'CANCEL'] as const,
});

const AdminHotelStatus = builder.enumType('AdminHotelStatus', {
  values: ['DRAFT', 'ACTIVE', 'INACTIVE'] as const,
});

const AdminHotelSort = builder.enumType('AdminHotelSort', {
  values: ['TITLE_ASC', 'TITLE_DESC', 'NEWEST'] as const,
});

type AdminBookingDetail = Prisma.BookingGetPayload<{
  include: {
    items: {
      include: {
        hotel: true;
        room: true;
        provider: true;
      };
    };
    events: true;
  };
}>;
type AdminBookingDetailItem = AdminBookingDetail['items'][number];
type AdminBookingDetailEvent = AdminBookingDetail['events'][number];
type AdminBookingHotel = AdminBookingDetailItem['hotel'];
type AdminBookingRoom = AdminBookingDetailItem['room'];

const AdminBookingHotel = builder.objectRef<AdminBookingHotel>('AdminBookingHotel');
AdminBookingHotel.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    slug: t.exposeString('slug'),
    title: t.exposeString('title'),
    categoryStars: t.exposeInt('categoryStars'),
  }),
});

const AdminBookingRoom = builder.objectRef<AdminBookingRoom>('AdminBookingRoom');
AdminBookingRoom.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
  }),
});

const AdminBookingProvider = builder.objectRef<{
  id: string;
  code: string;
  name: string;
}>('AdminBookingProvider');
AdminBookingProvider.implement({
  fields: (t) => ({
    code: t.exposeString('code'),
    name: t.exposeString('name'),
  }),
});

const AdminBookingItem = builder.objectRef<AdminBookingDetailItem>('AdminBookingItem');
AdminBookingItem.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    status: t.string({ resolve: (item) => item.status }),
    checkIn: t.expose('checkIn', { type: 'Date' }),
    checkOut: t.expose('checkOut', { type: 'Date' }),
    adults: t.exposeInt('adults'),
    childrenAges: t.exposeIntList('childrenAges'),
    priceAmount: t.string({ resolve: (item) => item.priceAmount.toString() }),
    currency: t.exposeString('currency'),
    providerBookingRef: t.exposeString('providerBookingRef', { nullable: true }),
    hotel: t.field({
      type: AdminBookingHotel,
      resolve: (item) => item.hotel,
    }),
    room: t.field({
      type: AdminBookingRoom,
      resolve: (item) => item.room,
    }),
    provider: t.field({
      type: AdminBookingProvider,
      resolve: (item) => item.provider,
    }),
  }),
});

const AdminBookingEvent = builder.objectRef<AdminBookingDetailEvent>('AdminBookingEvent');
AdminBookingEvent.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    type: t.exposeString('type'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    payload: t.string({
      nullable: true,
      resolve: (event) => event.payload == null ? null : JSON.stringify(event.payload),
    }),
  }),
});

const AdminBookingDetails = builder.objectRef<AdminBookingDetail>('AdminBookingDetails');
AdminBookingDetails.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    reference: t.exposeString('reference'),
    status: t.string({ resolve: (booking) => booking.status }),
    guestName: t.exposeString('guestName'),
    guestEmail: t.exposeString('guestEmail'),
    guestPhone: t.exposeString('guestPhone', { nullable: true }),
    totalAmount: t.string({ resolve: (booking) => booking.totalAmount.toString() }),
    currency: t.exposeString('currency'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    confirmedAt: t.expose('confirmedAt', { type: 'DateTime', nullable: true }),
    cancelledAt: t.expose('cancelledAt', { type: 'DateTime', nullable: true }),
    expiresAt: t.expose('expiresAt', { type: 'DateTime', nullable: true }),
    items: t.field({
      type: [AdminBookingItem],
      resolve: (booking) => booking.items,
    }),
    events: t.field({
      type: [AdminBookingEvent],
      resolve: (booking) => booking.events,
    }),
  }),
});

type AdminBookingsArgs = {
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'FAILED' | 'EXPIRED' | null;
  fromDate?: Date | null;
  toDate?: Date | null;
  guestEmail?: string | null;
  providerCode?: string | null;
};

function badInput(message: string): never {
  throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

function bookingWhere(args: AdminBookingsArgs): Prisma.BookingWhereInput {
  if (args.fromDate && args.toDate && args.fromDate > args.toDate) {
    badInput('La fecha inicial no puede ser posterior a la fecha final');
  }

  const where: Prisma.BookingWhereInput = {};
  if (args.status) where.status = args.status;
  if (args.fromDate || args.toDate) {
    where.createdAt = {
      ...(args.fromDate ? { gte: args.fromDate } : {}),
      ...(args.toDate ? { lt: new Date(args.toDate.getTime() + DAY_MS) } : {}),
    };
  }

  const guestEmail = args.guestEmail?.trim();
  if (guestEmail) {
    where.guestEmail = { contains: guestEmail, mode: 'insensitive' };
  }

  const providerCode = args.providerCode?.trim().toUpperCase();
  if (providerCode) {
    where.items = { some: { provider: { code: providerCode } } };
  }

  return where;
}

function bookingOrderBy(
  sort: 'CREATED_DESC' | 'CREATED_ASC' | 'TOTAL_DESC' | 'TOTAL_ASC' | null | undefined,
): Prisma.BookingOrderByWithRelationInput[] {
  switch (sort) {
    case 'CREATED_ASC':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'TOTAL_DESC':
      return [{ totalAmount: 'desc' }, { id: 'desc' }];
    case 'TOTAL_ASC':
      return [{ totalAmount: 'asc' }, { id: 'asc' }];
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

builder.queryField('adminBookings', (t) =>
  t.prismaConnection({
    type: 'Booking',
    cursor: 'id',
    defaultSize: 20,
    maxSize: MAX_BOOKING_PAGE_SIZE,
    args: {
      status: t.arg({ type: AdminBookingStatus, required: false }),
      fromDate: t.arg({ type: 'Date', required: false }),
      toDate: t.arg({ type: 'Date', required: false }),
      guestEmail: t.arg.string({ required: false }),
      providerCode: t.arg.string({ required: false }),
      sort: t.arg({
        type: AdminBookingSort,
        required: false,
        defaultValue: 'CREATED_DESC',
      }),
    },
    resolve: (query, _root, args, ctx) => {
      requireRole(ctx, ['AGENT', 'ADMIN']);
      return ctx.prisma.booking.findMany({
        ...query,
        where: bookingWhere(args),
        orderBy: bookingOrderBy(args.sort),
      });
    },
  }),
);

builder.queryField('adminBookingById', (t) =>
  t.field({
    type: AdminBookingDetails,
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (_root, args, ctx) => {
      requireRole(ctx, ['AGENT', 'ADMIN']);
      return ctx.prisma.booking.findUnique({
        where: { id: args.id },
        include: {
          items: {
            orderBy: { checkIn: 'asc' },
            include: { hotel: true, room: true, provider: true },
          },
          events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
      });
    },
  }),
);

builder.mutationField('transitionAdminBooking', (t) =>
  t.field({
    type: AdminBookingDetails,
    args: {
      id: t.arg.string({ required: true }),
      transition: t.arg({ type: AdminBookingTransition, required: true }),
      reason: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const actor = requireRole(ctx, ['AGENT', 'ADMIN']);
      const reason = args.reason?.trim();
      if (reason && reason.length > 500) {
        throw new GraphQLError('El motivo no puede superar los 500 caracteres', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      return ctx.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: args.id },
          include: { items: true },
        });
        if (!booking) {
          throw new GraphQLError('No se encontró la reserva', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        const fromStatus = args.transition === 'CONFIRM' ? 'PENDING' : 'CONFIRMED';
        const toStatus = args.transition === 'CONFIRM' ? 'CONFIRMED' : 'CANCELLED';
        if (booking.status !== fromStatus) {
          throw new GraphQLError(
            args.transition === 'CONFIRM'
              ? 'Solo se pueden confirmar reservas pendientes'
              : 'Solo se pueden cancelar reservas confirmadas',
            { extensions: { code: 'BAD_USER_INPUT' } },
          );
        }

        const changed = await tx.booking.updateMany({
          where: { id: booking.id, status: fromStatus },
          data: {
            status: toStatus,
            ...(args.transition === 'CONFIRM'
              ? { confirmedAt: new Date() }
              : { cancelledAt: new Date() }),
          },
        });
        if (changed.count !== 1) {
          throw new GraphQLError('La reserva cambió mientras se procesaba la acción', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        const changedItems = await tx.bookingItem.updateMany({
          where: { bookingId: booking.id, status: fromStatus },
          data: { status: toStatus },
        });
        if (changedItems.count !== booking.items.length) {
          throw new GraphQLError(
            'El estado de los servicios asociados no coincide con el de la reserva',
            { extensions: { code: 'INTERNAL_SERVER_ERROR' } },
          );
        }

        if (args.transition === 'CANCEL') {
          for (const item of booking.items) {
            for (
              let date = new Date(item.checkIn);
              date < item.checkOut;
              date.setUTCDate(date.getUTCDate() + 1)
            ) {
              const restored = await tx.roomInventory.updateMany({
                where: { roomId: item.roomId, date },
                data: { available: { increment: 1 } },
              });
              if (restored.count !== 1) {
                throw new GraphQLError(
                  'No se pudo restaurar el inventario de la reserva',
                  { extensions: { code: 'INTERNAL_SERVER_ERROR' } },
                );
              }
            }
          }
        }

        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            type: args.transition === 'CONFIRM' ? 'CONFIRMED' : 'CANCELLED',
            payload: {
              actorId: actor.id,
              fromStatus,
              toStatus,
              reason: reason || null,
            },
          },
        });

        return tx.booking.findUniqueOrThrow({
          where: { id: booking.id },
          include: {
            items: {
              orderBy: { checkIn: 'asc' },
              include: { hotel: true, room: true, provider: true },
            },
            events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
          },
        });
      });
    },
  }),
);

builder.queryField('adminHotels', (t) =>
  t.prismaConnection({
    type: 'Hotel',
    cursor: 'id',
    defaultSize: 20,
    maxSize: MAX_BOOKING_PAGE_SIZE,
    args: {
      query: t.arg.string({ required: false }),
      status: t.arg({ type: AdminHotelStatus, required: false }),
      sort: t.arg({
        type: AdminHotelSort,
        required: false,
        defaultValue: 'TITLE_ASC',
      }),
    },
    resolve: (query, _root, args, ctx) => {
      requireRole(ctx, ['AGENT', 'ADMIN']);
      const term = args.query?.trim();
      if (term && term.length > 120) {
        badInput('La búsqueda no puede superar los 120 caracteres');
      }
      return ctx.prisma.hotel.findMany({
        ...query,
        where: {
          ...(args.status ? { status: args.status } : {}),
          ...(term
            ? {
                OR: [
                  { searchKey: { contains: normalize(term) } },
                  {
                    destination: {
                      searchKey: { contains: normalize(term) },
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy:
          args.sort === 'TITLE_DESC'
            ? [{ title: 'desc' }, { id: 'desc' }]
            : args.sort === 'NEWEST'
              ? [{ createdAt: 'desc' }, { id: 'desc' }]
              : [{ title: 'asc' }, { id: 'asc' }],
      });
    },
  }),
);

const AdminCurrencyMetric = builder.objectRef<{
  currency: string;
  amount: string;
}>('AdminCurrencyMetric');
AdminCurrencyMetric.implement({
  fields: (t) => ({
    currency: t.exposeString('currency'),
    amount: t.exposeString('amount'),
  }),
});

const AdminBookingMetrics = builder.objectRef<{
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  failedBookings: number;
  expiredBookings: number;
  confirmedTotals: Array<{ currency: string; amount: string }>;
}>('AdminBookingMetrics');
AdminBookingMetrics.implement({
  fields: (t) => ({
    totalBookings: t.exposeInt('totalBookings'),
    pendingBookings: t.exposeInt('pendingBookings'),
    confirmedBookings: t.exposeInt('confirmedBookings'),
    cancelledBookings: t.exposeInt('cancelledBookings'),
    failedBookings: t.exposeInt('failedBookings'),
    expiredBookings: t.exposeInt('expiredBookings'),
    confirmedTotals: t.field({
      type: [AdminCurrencyMetric],
      resolve: (metrics) => metrics.confirmedTotals,
    }),
  }),
});

builder.queryField('adminBookingMetrics', (t) =>
  t.field({
    type: AdminBookingMetrics,
    args: {
      fromDate: t.arg({ type: 'Date', required: false }),
      toDate: t.arg({ type: 'Date', required: false }),
    },
    resolve: async (_root, args, ctx) => {
      requireRole(ctx, ['AGENT', 'ADMIN']);
      if (args.fromDate && args.toDate && args.fromDate > args.toDate) {
        badInput('La fecha inicial no puede ser posterior a la fecha final');
      }

      const where: Prisma.BookingWhereInput = {
        ...(args.fromDate || args.toDate
          ? {
              createdAt: {
                ...(args.fromDate ? { gte: args.fromDate } : {}),
                ...(args.toDate
                  ? { lt: new Date(args.toDate.getTime() + DAY_MS) }
                  : {}),
              },
            }
          : {}),
      };
      const groups = await ctx.prisma.booking.groupBy({
        by: ['status', 'currency'],
        where,
        _count: { _all: true },
        _sum: { totalAmount: true },
      });

      const counts: Record<string, number> = {};
      const confirmedTotals = new Map<string, Prisma.Decimal>();
      for (const group of groups) {
        counts[group.status] = (counts[group.status] ?? 0) + group._count._all;
        if (group.status === 'CONFIRMED' && group._sum.totalAmount) {
          confirmedTotals.set(group.currency, group._sum.totalAmount);
        }
      }

      return {
        totalBookings: Object.values(counts).reduce((total, count) => total + count, 0),
        pendingBookings: counts.PENDING ?? 0,
        confirmedBookings: counts.CONFIRMED ?? 0,
        cancelledBookings: counts.CANCELLED ?? 0,
        failedBookings: counts.FAILED ?? 0,
        expiredBookings: counts.EXPIRED ?? 0,
        confirmedTotals: Array.from(confirmedTotals, ([currency, amount]) => ({
          currency,
          amount: amount.toString(),
        })).sort((left, right) => left.currency.localeCompare(right.currency)),
      };
    },
  }),
);
