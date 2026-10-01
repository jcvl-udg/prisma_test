import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import { DateResolver, DateTimeResolver } from 'graphql-scalars';

import type PrismaTypes from '../lib/pothos-prisma-types';
import { getDatamodel } from '../lib/pothos-prisma-types';
import prisma from '../lib/prisma';
import type { Context } from './context';

// ─────────────────────────────────────────────────────────────
// ÚNICA instancia de SchemaBuilder de todo el proyecto.
// Todos los módulos (server/modules/*) importan `builder` de aquí.
// Aquí se declaran: tipos de Prisma, tipo del contexto y scalars.
// ─────────────────────────────────────────────────────────────
export const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: Context;
  Scalars: {
    // DateTime -> columnas con hora (createdAt)   Date -> columnas @db.Date (checkIn)
    DateTime: { Input: Date; Output: Date };
    Date: { Input: Date; Output: Date };
  };
}>({
  plugins: [PrismaPlugin],
  prisma: {
    client: prisma,
    dmmf: getDatamodel(),
    // En desarrollo avisa cuando un campo pedido no estaba en la selección optimizada
    onUnusedQuery: process.env.NODE_ENV === 'production' ? null : 'warn',
  },
});

builder.addScalarType('DateTime', DateTimeResolver);
builder.addScalarType('Date', DateResolver);

// Raíces del esquema: los módulos añaden campos con builder.queryField / mutationField
builder.queryType({});
builder.mutationType({});

// Los Decimal de Prisma (precios) se exponen como String para no perder precisión
// en JSON. Se usa así:  t.string({ resolve: (x) => x.price.toString() })
