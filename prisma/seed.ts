import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter: pool });

const DESTINATIONS = [
  { name: 'Cancún', code: 'CUN' },
  { name: 'Tokyo', code: 'NRT' },
  { name: 'Paris', code: 'CDG' },
  { name: 'New York', code: 'JFK' },
  { name: 'London', code: 'LHR' },
  { name: 'Dubai', code: 'DXB' },
  { name: 'Rome', code: 'FCO' },
];

const HOTEL_PREFIXES = ['Grand', 'Boutique', 'Royal', 'Resort', 'Plaza', 'Vista', 'Oasis'];
const HOTEL_SUFFIXES = ['Palace', 'Inn', 'Suites', 'Spa', 'Retreat', 'Lodge'];
const ROOM_TYPES = ['Standard Room', 'Deluxe Ocean View', 'Presidential Suite', 'Family Room', 'Economy Twin'];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log('🌱 Iniciando la generación de Mock Data masiva...');

  // Limpiar DB preventivo (opcional pero recomendado para evitar duplicados en seed)
  await prisma.providerMapping.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.hotel.deleteMany({});
  await prisma.destination.deleteMany({});

  for (const destData of DESTINATIONS) {
    const destination = await prisma.destination.create({
      data: destData,
    });

    // Generar entre 10 y 25 hoteles por destino
    const numHotels = getRandomInt(10, 25);
    
    for (let i = 0; i < numHotels; i++) {
      const hotelName = `${getRandomItem(HOTEL_PREFIXES)} ${destination.name} ${getRandomItem(HOTEL_SUFFIXES)}`;
      
      const numRooms = getRandomInt(2, 5);
      const roomsData = Array.from({ length: numRooms }).map(() => ({
        name: getRandomItem(ROOM_TYPES),
        externalRoomCode: `ROOM-${getRandomInt(1000, 9999)}`
      }));

      await prisma.hotel.create({
        data: {
          title: hotelName,
          categoryStars: getRandomInt(3, 5),
          destinationId: destination.id,
          rooms: {
            create: roomsData
          },
          providerMappings: {
            create: [
              {
                providerName: 'HOTELBEDS',
                externalId: `HB-${destination.code}-${getRandomInt(10000, 99999)}`
              },
              // 30% probabilidad de tener mapping de Omnibees también
              ...(Math.random() > 0.7 ? [{
                providerName: 'OMNIBEES',
                externalId: `OB-${getRandomInt(10000, 99999)}`
              }] : [])
            ]
          }
        }
      });
    }
  }

  const totalHotels = await prisma.hotel.count();
  console.log(`✅ Seeding completado. ${DESTINATIONS.length} destinos y ${totalHotels} hoteles generados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });