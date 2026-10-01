import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../prisma/generated/client"
import { Pool } from "pg" 

// 1. Usamos globalThis para mantener la referencia en memoria
const globalForPrisma = globalThis as unknown as { 
  prisma: PrismaClient | undefined 
}

// 2. Si globalForPrisma.prisma ya existe (por un hot-reload previo), la reusamos.
// Si no existe (primera vez o en producción), creamos la instancia.
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ 
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL! })) 
})

// 3. En desarrollo, guardamos la instancia recién creada en el objeto global
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export default prisma