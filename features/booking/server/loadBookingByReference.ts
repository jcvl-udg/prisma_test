import type { PrismaClient } from '../../../prisma/generated/client';

export type BookingPageItem = {
  id: string;
  hotelTitle: string;
  hotelSlug: string;
  roomName: string;
  checkIn: string;   // "YYYY-MM-DD"
  checkOut: string;  // "YYYY-MM-DD"
  adults: number;
  childrenAges: number[];
  priceAmount: string;
  currency: string;
  status: string;
};

export type BookingPageEvent = {
  id: string;
  type: string;
  createdAt: string;
  payload: unknown;
};

export type BookingPageDTO = {
  reference: string;
  status: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  totalAmount: string;
  currency: string;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
  items: BookingPageItem[];
  events: BookingPageEvent[];
};

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadBookingByReference(
  prisma: PrismaClient,
  reference: string,
): Promise<BookingPageDTO | null> {
  if (!reference) return null;

  const booking = await prisma.booking.findUnique({
    where: { reference },
    include: {
      items: {
        orderBy: { checkIn: 'asc' },
        include: {
          room: { include: { hotel: true } },
        },
      },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!booking) return null;

  return {
    reference: booking.reference,
    status: booking.status,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestPhone: booking.guestPhone ?? null,
    totalAmount: booking.totalAmount.toString(),
    currency: booking.currency,
    createdAt: booking.createdAt.toISOString(),
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    expiresAt: booking.expiresAt?.toISOString() ?? null,
    items: booking.items.map((it) => ({
      id: it.id,
      hotelTitle: it.room.hotel.title,
      hotelSlug: it.room.hotel.slug,
      roomName: it.room.name,
      checkIn: toDateOnly(it.checkIn),
      checkOut: toDateOnly(it.checkOut),
      adults: it.adults,
      childrenAges: it.childrenAges,
      priceAmount: it.priceAmount.toString(),
      currency: it.currency,
      status: it.status,
    })),
    events: booking.events.map((ev) => ({
      id: ev.id,
      type: ev.type,
      createdAt: ev.createdAt.toISOString(),
      payload: ev.payload,
    })),
  };
}