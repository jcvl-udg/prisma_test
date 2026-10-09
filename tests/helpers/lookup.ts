import { testPrisma } from './db';

// Encuentra un hotel del seed con al menos N noches disponibles en el futuro.
// Útil para tests de lectura que NO quieren crear fixtures.
export async function findSeededAvailableRoom(nights: number) {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);

  const rows = await testPrisma.$queryRaw<{ roomId: string; hotelId: string }[]>`
    SELECT r.id AS "roomId", r."hotelId" AS "hotelId"
    FROM "Room" r
    JOIN "RoomInventory" i ON i."roomId" = r.id
    WHERE i.date >= ${from}::date
      AND i.date < ${new Date(from.getTime() + nights * 86_400_000)}::date
      AND i.available > 0
    GROUP BY r.id, r."hotelId"
    HAVING COUNT(*) = ${nights}::int
    LIMIT 1
  `;
  if (!rows.length) throw new Error(`No hay room con ${nights} noches disponibles en el seed`);
  return rows[0];
}