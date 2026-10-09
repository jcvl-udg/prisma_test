import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../prisma/generated/client';
import { Pool } from 'pg';

export const testPrisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL! })),
});

export async function disconnectTestDb() {
  await testPrisma.$disconnect();
}