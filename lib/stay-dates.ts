export interface StayDates {
  checkIn: string;
  checkOut: string;
}

const MS_PER_DAY = 86_400_000;

function toDateOnly(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function getDefaultStayDates(now = new Date()): StayDates {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return {
    checkIn: toDateOnly(todayUtc),
    checkOut: toDateOnly(todayUtc + 7 * MS_PER_DAY),
  };
}

export function isValidStayDates(
  checkIn: string | undefined,
  checkOut: string | undefined,
): boolean {
  if (!checkIn || !checkOut) return false;

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateOnlyPattern.test(checkIn) || !dateOnlyPattern.test(checkOut)) return false;

  const parsedCheckIn = new Date(`${checkIn}T00:00:00.000Z`);
  const parsedCheckOut = new Date(`${checkOut}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsedCheckIn.getTime()) &&
    !Number.isNaN(parsedCheckOut.getTime()) &&
    parsedCheckIn.toISOString().slice(0, 10) === checkIn &&
    parsedCheckOut.toISOString().slice(0, 10) === checkOut &&
    parsedCheckOut.getTime() > parsedCheckIn.getTime()
  );
}
