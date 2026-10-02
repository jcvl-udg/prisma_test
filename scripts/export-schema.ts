import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { lexicographicSortSchema, printSchema } from 'graphql';
// OJO: este import existe cuando termines la separación del servidor (Tarea 2).
// Hoy el esquema vive dentro de pages/api/graphql.ts y no se exporta.
import { schema } from '../server/schema';

// lexicographicSortSchema ordena los tipos alfabéticamente:
// el archivo cambia solo cuando cambia el esquema (diffs limpios en git).
const sdl = printSchema(lexicographicSortSchema(schema));
writeFileSync('./schema.graphql', sdl);

console.log('✅ schema.graphql actualizado');
// Importar el schema abre el cliente de Prisma: cierra el proceso explícitamente
process.exit(0);