# Guía de tipado: TypeScript + GraphQL + Prisma + Pothos

## 1. Principio general

El proyecto tiene **dos flujos de tipos que se alimentan entre sí**:

```
┌──────────────────┐         ┌────────────────────────┐
│  schema.prisma   │  prisma │  prisma/generated/     │
│  (fuente verdad) │ ──────▶ │  (tipos de modelos)    │
└──────────────────┘ generate└───────────┬────────────┘
                                          │
                                          │ (leídos por Pothos)
                                          ▼
                             ┌────────────────────────┐
                             │ lib/pothos-prisma-     │
                             │ types.ts (generado por │
                             │ prisma-pothos-types)   │
                             └───────────┬────────────┘
                                          │
                                          │ (usado en builder.ts)
                                          ▼
                             ┌────────────────────────┐
                             │ server/modules/*.ts    │
                             │ (define el schema GQL) │
                             └───────────┬────────────┘
                                          │
                                          │ graphql:export
                                          ▼
                             ┌────────────────────────┐
                             │ schema.graphql (SDD)   │
                             └───────────┬────────────┘
                                          │
                                          │ graphql:codegen
                                          ▼
                             ┌────────────────────────┐
                             │ gql/graphql.ts         │
                             │ (tipos de operations)  │
                             └────────────────────────┘
```

**Regla de oro:** nunca edites archivos dentro de `prisma/generated/` ni `gql/`.
Son salidas de herramientas. Si algo está mal, corriges el origen y regeneras.

## 2. ¿Por qué dos generadores?

### 2.1 `prisma generate` → tipos de los **modelos**

- Entrada: `prisma/schema.prisma`.
- Salida: `prisma/generated/` (cliente + tipos).
- Da: `PrismaClient`, tipos `User`, `Hotel`, `Prisma.HotelWhereInput`, `Prisma.HotelCreateInput`, etc.
- **Cuándo se corre:** cada vez que cambias `schema.prisma`.

Comando:
```bash
npx prisma generate
# o automáticamente tras:
npx prisma migrate dev
npx prisma db push
```

### 2.2 `prisma-pothos-types` → puente Prisma ↔ Pothos

- Entrada: `prisma/schema.prisma` (vía el generator `pothos`).
- Salida: `lib/pothos-prisma-types.ts`.
- Da: el tipo `PrismaTypes` que mapea cada modelo de Prisma a su `Shape`, `Include`,
  `Select`, `OrderBy`, `Where`, `Relations`, etc., más el `datamodel`.
- **Cuándo se corre:** junto con `prisma generate` (está en el mismo generator).

Fragmento generado (no editar):
```ts
Hotel: {
  Name: "Hotel";
  Shape: Hotel;
  Include: Prisma.HotelInclude;
  Select: Prisma.HotelSelect;
  WhereUnique: Prisma.HotelWhereUniqueInput;
  Relations: {
    destination: { Shape: Destination; Nullable: false };
    rooms: { Shape: Room[]; Nullable: false };
    // ...
  };
}
```

Esto le permite a Pothos saber qué campos existen, cuáles son relaciones, si son
nullable, y ofrecer `t.relation('rooms')` tipado sin que escribas nada a mano.

### 2.3 `graphql-codegen` → tipos de las **operaciones del cliente**

- Entrada: `schema.graphql` (SDD del schema actual) + documentos `graphql(\`...\`)`.
- Salida: `gql/gql.ts` + `gql/graphql.ts`.
- Da: `TypedDocumentNode` para cada operación → `useQuery` / `useMutation` tipados.
- **Cuándo se corre:** después de cambiar el schema GraphQL **o** de escribir/editar
  un documento `graphql(\`...\`)` en el frontend.

## 3. Comandos y cuándo usarlos

```bash
# 1. Cambios en la DB (modelos, campos, enums)
npx prisma migrate dev --name <descripcion>   # crea migración + regenera cliente
npx prisma generate                            # solo regenera (sin migración)
npx prisma db push                             # sincroniza sin migración (prototipo)

# 2. Cambios en el schema GraphQL (nuevos tipos, queries, mutations)
npm run graphql:export      # server/schema → schema.graphql
npm run graphql:codegen     # schema.graphql + documentos → gql/
npm run graphql:sync        # los dos anteriores en orden

# 3. Trabajo iterativo en el frontend
npm run graphql:watch       # codegen observa y regenera al guardar
```

## 4. Cómo añadir un campo nuevo — ejemplo completo

Supón que quieres añadir `Hotel.checkInTime: String?` (hora de check-in).

### Paso 1 — Modificar el schema de Prisma

```prisma
// prisma/schema.prisma
model Hotel {
  // ...
  checkInTime String?   // "15:00"
}
```

### Paso 2 — Migrar y regenerar el cliente

```bash
npx prisma migrate dev --name add_hotel_checkin_time
```

Esto automáticamente:
- Aplica el cambio a la DB.
- Regenera `prisma/generated/`.
- Regenera `lib/pothos-prisma-types.ts` (por el generator `pothos`).

### Paso 3 — Exponerlo en GraphQL

Editar `server/modules/catalog.ts`, dentro de `builder.prismaObject('Hotel', ...)`:

```ts
builder.prismaObject('Hotel', {
  fields: (t) => ({
    // ...
    checkInTime: t.exposeString('checkInTime', { nullable: true }), // ← NUEVO
  }),
});
```

> Gracias a `prisma-pothos-types`, `t.exposeString` valida que `checkInTime` existe
> y es `String?`. Si te equivocas, TypeScript te lo dice antes de compilar.

### Paso 4 — Regenerar el schema GraphQL y el codegen

```bash
npm run graphql:sync
```

Esto:
1. `graphql:export` → corre `scripts/export-schema.ts` → escribe `schema.graphql`.
2. `graphql:codegen` → lee `schema.graphql` + documentos → regenera `gql/`.

### Paso 5 — Consumirlo en el frontend

```tsx
import { graphql } from '../gql';
import { useQuery } from '@apollo/client/react';

const HOTEL_QUERY = graphql(`
  query HotelBySlug($slug: String!) {
    hotelBySlug(slug: $slug) {
      id
      title
      checkInTime   # ← ya autocompleta y tipa
    }
  }
`);

function HotelDetail({ slug }: { slug: string }) {
  const { data } = useQuery(HOTEL_QUERY, { variables: { slug } });
  return <p>Check-in: {data?.hotelBySlug?.checkInTime ?? 'No definido'}</p>;
}
```

## 5. Cómo añadir una mutation nueva

Ejemplo: `createQuote`.

### Paso 1 — Definirla en Pothos

`server/modules/quote.ts` (nuevo):

```ts
import { builder } from '../builder';
import { Prisma } from '../../prisma/generated/client';

builder.mutationField('createQuote', (t) =>
  t.prismaField({
    type: 'Quote',                       // debe existir prismaObject('Quote')
    args: {
      hotelId: t.arg.string({ required: true }),
      roomId: t.arg.string({ required: true }),
      checkIn: t.arg({ type: 'Date', required: true }),
      checkOut: t.arg({ type: 'Date', required: true }),
      adults: t.arg.int({ required: true }),
      childrenAges: t.arg.intList({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      // ... lógica
    },
  }),
);
```

### Paso 2 — Registrar el módulo

`server/schema.ts`:

```ts
import './modules/catalog';
import './modules/booking';
import './modules/user';
import './modules/quote';   // ← NUEVO
```

### Paso 3 — Regenerar y consumir

```bash
npm run graphql:sync
```

### Paso 4 — Hook tipado en el frontend

```tsx
import { graphql } from '../gql';
import { useMutation } from '@apollo/client/react';

const CREATE_QUOTE = graphql(`
  mutation CreateQuote(
    $hotelId: String!
    $roomId: String!
    $checkIn: Date!
    $checkOut: Date!
    $adults: Int!
    $childrenAges: [Int!]!
  ) {
    createQuote(
      hotelId: $hotelId
      roomId: $roomId
      checkIn: $checkIn
      checkOut: $checkOut
      adults: $adults
      childrenAges: $childrenAges
    ) {
      id
      priceAmount
      currency
      expiresAt
    }
  }
`);

function useCreateQuote() {
  return useMutation(CREATE_QUOTE);
}
```

Si escribes mal un nombre de campo o tipo, `useMutation` lo marca en rojo.

## 6. Nomenclatura de tipos generados

### 6.1 Desde Prisma (`prisma/generated/`)

| Genera | Ejemplo |
|---|---|
| Modelos | `User`, `Hotel`, `Booking` |
| Namespace `Prisma` | `Prisma.HotelWhereInput`, `Prisma.HotelOrderByWithRelationInput` |
| Enums | `UserRole`, `BookingStatus`, `HotelStatus`, `EventType` |
| Cliente | `PrismaClient` |

### 6.2 Desde Pothos (`lib/pothos-prisma-types.ts`)

Un solo export por defecto: `PrismaTypes` (mapa de modelos). Y `getDatamodel()`.

**No se importa a mano en el código de negocio.** Solo lo usa `server/builder.ts`:

```ts
import type PrismaTypes from '../lib/pothos-prisma-types';
import { getDatamodel } from '../lib/pothos-prisma-types';

new SchemaBuilder<{ PrismaTypes: PrismaTypes; Context: Context }>({
  prisma: { client: prisma, dmmf: getDatamodel() },
});
```

### 6.3 Desde codegen (`gql/graphql.ts`)

| Genera | Ejemplo |
|---|---|
| Variables por operación | `FullSearchQueryVariables` |
| Resultado por operación | `FullSearchQuery` |
| `TypedDocumentNode` | `FullSearchDocument` |
| Tipos del schema | `Hotel`, `Room`, `Booking`, `Date`, `DateTime` |

Se usan así:

```ts
import { FullSearchDocument } from '../gql/graphql';
import type { FullSearchQuery, FullSearchQueryVariables } from '../gql/graphql';
```

O a través de `graphql(\`...\`)` que devuelve el `TypedDocumentNode` ya tipado
(la forma recomendada en este proyecto).

## 7. Scalar personalizados

Hay dos scalars GraphQL definidos en `server/builder.ts`:

```ts
builder.addScalarType('DateTime', DateTimeResolver);  // columnas con hora
builder.addScalarType('Date', DateResolver);          // columnas @db.Date
```

- **`DateTime`** → `createdAt`, `expiresAt`, `updatedAt` (ISO 8601 con zona).
- **`Date`** → `checkIn`, `checkOut`, `RoomInventory.date` (YYYY-MM-DD).

En el codegen (`codegen.ts`) ambos se mapean a `string`:

```ts
scalars: { DateTime: 'string', Date: 'string', Decimal: 'string' }
```

**Consecuencia práctica:** en el frontend recibes strings, no `Date`. Si necesitas
operar con ellos, parsea explícitamente: `new Date(booking.expiresAt)`.

Los `Decimal` de Prisma tampoco se exponen como número — se exponen como String
con `t.string({ resolve: (x) => x.priceAmount.toString() })` para no perder
precisión. En el cliente conviertes con `Number(x)` solo si es para display.

## 8. Errores comunes y cómo resolverlos

### 8.1 "Property 'X' does not exist on type 'Y'"

Significa que un campo nuevo no se ha regenerado.

**Solución:**
```bash
npx prisma generate         # si es campo de DB
npm run graphql:sync        # si es campo GraphQL
```

### 8.2 "Cannot find module '../gql'"

El codegen no se ha corrido, o `gql/` no existe.

**Solución:**
```bash
npm run graphql:export      # asegúrate de que schema.graphql existe
npm run graphql:codegen
```

### 8.3 "Unknown type 'Date'. Did you mean ...?"

El scalar `Date` no está declarado en el schema GraphQL.

**Solución:** verificar que `builder.addScalarType('Date', DateResolver)` está en
`server/builder.ts` **antes** de `builder.toSchema()`.

### 8.4 `graphql()` devuelve `unknown`

El documento que le pasaste no está en `gql/gql.ts` (el codegen no lo conoce).

**Solución:** correr `npm run graphql:codegen` y verificar que el archivo del
componente está dentro de `documents` en `codegen.ts` (`features/**`, `pages/**`,
`components/**`).

### 8.5 Pothos se queja: "Prisma model 'X' is not defined"

Existe un `prismaObject('X')` pero el modelo no está en `schema.prisma`, o
`lib/pothos-prisma-types.ts` está desactualizado.

**Solución:**
```bash
npx prisma generate    # regenera también pothos-prisma-types
```

### 8.6 "Argumento de tipo 'number' no asignable a 'Decimal'"

En un resolver, intentas pasar un `number` donde Prisma espera `Decimal`.

**Solución:**
```ts
import { Prisma } from '../../prisma/generated/client';
const total = new Prisma.Decimal(0);
// usa total.add(...), total.mul(...), nunca `+`/`*` directo
```

## 9. Type-checking estricto

El proyecto tiene `@ts-nocheck` en archivos generados (`gql/*`, `prisma/generated/*`).
El resto del código **sí se verifica**:

```bash
npx tsc --noEmit         # comprueba sin emitir JS
```

Recomendado en CI y antes de cada commit. Si pasa, GraphQL y Prisma están
correctamente tipados end-to-end.

## 10. Diagrama del flujo de regeneración

```
[Cambio en schema.prisma]
        │
        ├──▶ npx prisma migrate dev
        │      ├── Aplica migración a DB
        │      ├── Regenera prisma/generated/
        │      └── Regenera lib/pothos-prisma-types.ts
        │
        ▼
[Cambio en server/modules/*.ts]
        │
        ├──▶ npm run graphql:export
        │      └── Escribe schema.graphql (SDD)
        │
        ├──▶ npm run graphql:codegen
        │      └── Regenera gql/gql.ts y gql/graphql.ts
        │
        ▼
[Cambio en un componente (graphql(`...`))]
        │
        └──▶ npm run graphql:codegen
               └── Añade la operation a gql/graphql.ts
```

En desarrollo, `npm run graphql:watch` deja corriendo el codegen y regenera al
guardar archivos.

## 11. Checklist antes de hacer commit

- [ ] `npx tsc --noEmit` sin errores.
- [ ] `npm run graphql:sync` ejecutado (si tocaste `server/modules/` o documentos).
- [ ] `npx prisma generate` ejecutado (si tocaste `schema.prisma`).
- [ ] `gql/` y `schema.graphql` comiteados junto con el cambio (son parte del código).
- [ ] `prisma/generated/` y `lib/pothos-prisma-types.ts` comiteados (o ignorados,
      según convención del equipo — actualmente sí se versionan).

## 12. Regla de oro resumida

> **Los tipos no se escriben, se generan.**
> Si necesitas un tipo nuevo, primero existe en Prisma o en Pothos, luego se
> propaga por los generadores. Nunca a mano.