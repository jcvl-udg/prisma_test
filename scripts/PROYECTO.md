# Proyecto de Reservas Hoteleras — Guía de Arquitectura

## 1. ¿Qué es este proyecto?

Un sistema de reservas hoteleras tipo B2B/B2C construido con Next.js (Pages Router)
y TypeScript. Permite buscar hoteles por destino/fechas, cotizar habitaciones y
(generar la reserva — en desarrollo). Está pensado para integrar múltiples
proveedores externos (HBX, Omnibees) junto con inventario propio.

## 2. Stack principal

| Capa | Tecnología | Propósito |
|---|---|---|
| Framework | **Next.js 16** (Pages Router) | SSR, rutas API, build |
| Lenguaje | **TypeScript 5.9** | Tipado estático end-to-end |
| Base de datos | **PostgreSQL** | Datos relacionales |
| ORM | **Prisma 7** + `@prisma/adapter-pg` | Acceso tipado a DB, migraciones |
| API | **GraphQL Yoga 5** | Servidor GraphQL sobre `/api/graphql` |
| Schema builder | **Pothos** (`@pothos/core`) | Definir GraphQL schema desde TS |
| Plugins Pothos | `plugin-prisma`, `plugin-relay` | Conexión a Prisma + paginación cursor |
| Cliente GraphQL | **Apollo Client 4** | Queries/mutations desde React |
| Codegen | **GraphQL Codegen** + `client-preset` | Tipos TS desde operaciones GraphQL |
| UI | **React 19** + **Tailwind CSS 4** | Componentes y estilos |
| Estado global | React Context (carrito/booking) | Estado de UI compartido |
| Seed | `tsx` + `mulberry32` | Poblar DB determinista |

## 3. Estructura del proyecto

```
.
├── prisma/
│   ├── schema.prisma              # Modelo de datos (fuente de verdad)
│   ├── seed.ts                    # Pobla la DB con datos realistas
│   └── generated/                 # Cliente Prisma generado (no editar)
│
├── lib/
│   ├── prisma.ts                  # Singleton de PrismaClient
│   ├── apollo-client.ts           # Fábrica del ApolloClient
│   ├── text.ts                    # normalize() / slugify()
│   └── pothos-prisma-types.ts     # Tipos Prisma↔Pothos (generado)
│
├── server/
│   ├── builder.ts                 # Instancia única de SchemaBuilder
│   ├── context.ts                 # Context por request (prisma, user, anonymousId)
│   ├── schema.ts                  # Ensambla el schema importando módulos
│   └── modules/
│       ├── catalog.ts             # Queries: hotels, destinations, suggestions...
│       ├── booking.ts             # Tipos Booking/BookingItem (mutation pendiente)
│       └── user.ts                # Tipos User/Profile + signup temporal
│
├── pages/
│   ├── _app.tsx                   # ApolloProvider + CartProvider
│   ├── index.tsx                  # Home (Prisma directo — a migrar)
│   ├── search.tsx                 # Búsqueda con Apollo
│   ├── create.tsx                 # Formulario alta de hotel
│   ├── signup.tsx                 # Registro (temporal)
│   └── api/graphql.ts             # Endpoint GraphQL Yoga
│
├── features/
│   ├── booking/CartContext.tsx    # Estado del carrito
│   ├── catalog/components/
│   │   └── HotelCard.tsx          # Tarjeta de hotel
│   └── search/components/
│       └── SearchBar.tsx          # Input + autocomplete + fechas
│
├── gql/                           # ← GENERADO por codegen (no editar)
│   ├── gql.ts                     # Función graphql() tipada
│   ├── graphql.ts                 # Tipos de cada operation
│   └── index.ts                   # Barrel
│
├── schema.graphql                 # ← GENERADO por script (SDD del schema)
└── codegen.ts                     # Configuración de graphql-codegen
```

## 4. Flujo de datos

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENTE (navegador)                                            │
│  ─────────────────                                              │
│  Página React                                                   │
│    │                                                            │
│    ├─▶ useQuery / useMutation (Apollo)                          │
│    │                                                            │
│    └─▶ graphql(`query ...`)  ──┐                                │
│         (documento tipado)     │                                │
└────────────────────────────────┼────────────────────────────────┘
                                 │ HTTP POST /api/graphql
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  SERVIDOR Next.js                                               │
│  ─────────────────                                              │
│  pages/api/graphql.ts                                           │
│    │  createYoga({ schema, context })                           │
│    ▼                                                            │
│  GraphQL Yoga parsea el documento                               │
│    │                                                            │
│    ├─▶ createContext(req)  → ctx = { prisma, user, anonymousId }│
│    │                                                            │
│    ▼                                                            │
│  Pothos resolver (server/modules/*.ts)                          │
│    │                                                            │
│    └─▶ ctx.prisma.hotel.findMany({ ... })                       │
│         (Prisma Client tipado)                                  │
└────────────────────────────────┬────────────────────────────────┘
                                 │ SQL
                                 ▼
                          ┌──────────────┐
                          │  PostgreSQL  │
                          └──────────────┘
```

## 5. Piezas clave explicadas

### 5.1 Prisma (`prisma/schema.prisma`)

Fuente única de verdad. Define los modelos (`User`, `Hotel`, `Room`, `Booking`,
`Quote`, etc.), sus relaciones, índices y enums (`BookingStatus`, `UserRole`,
`HotelStatus`, `EventType`). Cualquier cambio aquí requiere regenerar el cliente.

- **Cliente generado**: `prisma/generated/` (nunca editar).
- **Seed**: `prisma/seed.ts` con `mulberry32(20260930)` → misma data en cada corrida.

Modelos centrales del negocio:

| Modelo | Rol |
|---|---|
| `Destination` | Catálogo de destinos (país, temas, popularidad) |
| `Hotel` | Ficha canónica del hotel (agrega precio/rating denormalizados) |
| `Room` | **Tipo** de habitación (no unidad física) |
| `RoomInventory` | Una fila por `(roomId, date)` con `available` y `priceAmount` |
| `Provider` | Proveedor externo (LOCAL, HOTELBEDS, OMNIBEES) |
| `ProviderMapping` / `RoomMapping` | Traducen IDs canónicos ↔ IDs del proveedor |
| `Quote` | Precio congelado con caducidad (~30 min) |
| `Booking` / `BookingItem` | Reserva con snapshot de lo vendido |
| `BookingEvent` | Bitácora de auditoría (CREATED, PROVIDER_CONFIRMED...) |
| `UserEvent` | Señales de comportamiento (SEARCH, HOTEL_VIEW, BOOKED...) |

### 5.2 Pothos (`server/builder.ts` + `server/modules/*.ts`)

Pothos **genera el schema GraphQL a partir de TypeScript**, no al revés. Cada
módulo registra tipos (`builder.prismaObject`), queries (`builder.queryField`)
y mutations (`builder.mutationField`).

- `builder.ts`: única instancia del builder. Declara `PrismaTypes`, `Context`,
  y scalars (`DateTime`, `Date`).
- `schema.ts`: importa los módulos (efecto secundario) y llama `builder.toSchema()`.
- `context.ts`: lo que llega a cada resolver como `ctx`. Hoy expone `prisma`,
  `user: null`, `anonymousId`.

### 5.3 GraphQL Yoga (`pages/api/graphql.ts`)

Envuelve el schema con un HTTP handler compatible con Next. Expone `/api/graphql`
y monta GraphiQL en desarrollo. Construye `ctx` por request.

### 5.4 Apollo Client (`lib/apollo-client.ts`)

Fábrica que decide la URL según server-side (SSR) o cliente. Se monta una vez en
`_app.tsx` con `<ApolloProvider>`.

### 5.5 Codegen (`gql/`)

Los documentos `graphql(...)` que escribes en páginas/componentes se convierten
en `TypedDocumentNode` gracias al preset `client`. **No escribes los tipos a mano**;
corres `npm run graphql:sync` y aparecen en `gql/graphql.ts`.

## 6. Convenciones de nombres

### GraphQL — Queries

| Nombre | Tipo | Uso |
|---|---|---|
| `hotels(filter, sort, first, after)` | Connection (Relay) | Búsqueda principal paginada |
| `hotelsCount(filter)` | Int | Contador sin traer filas |
| `hotelBySlug(slug)` | Hotel? | Detalle de hotel |
| `destinations(featuredOnly, take)` | [Destination] | Lista de destinos |
| `destinationBySlug(slug)` | Destination? | Detalle de destino |
| `amenities` | [Amenity] | Catálogo para filtros |
| `suggestions(query, take)` | Suggestions | Autocomplete (destinos + hoteles) |
| `searchHotels(...)` | [Hotel] | **LEGACY** — deprecado, migrar a `hotels` |

### GraphQL — Mutations

| Nombre | Estado | Descripción |
|---|---|---|
| `createManualHotel(...)` | ✅ | Alta manual de hotel + upsert de destino |
| `signupUser(...)` | ⚠️ Temporal | Registro sin password (se elimina al montar auth) |
| `createProfile(...)` | ⚠️ Temporal | Perfil ligado a email (se elimina al montar auth) |
| `createQuote(...)` | ❌ Pendiente | Congelar precio (Fase 1) |
| `createBooking(...)` | ❌ Pendiente | Crear reserva + idempotencia (Fase 1) |

### Carpetas `features/*`

Se organiza **por dominio funcional**, no por tipo de archivo:

- `features/booking/` — Todo lo del flujo de reserva (contexto, hooks, componentes).
- `features/catalog/` — Componentes de presentación de hoteles/habitaciones.
- `features/search/` — Búsqueda y filtros.

## 7. Dependencias críticas y para qué sirven

```jsonc
{
  // DB y ORM
  "@prisma/client": "^7.5.0",           // Cliente generado
  "@prisma/adapter-pg": "^7.10.0",      // Driver nativo para Postgres
  "pg": "^8.20.0",                      // Pool de conexiones

  // GraphQL servidor
  "graphql": "^16.13.1",                // Implementación de referencia
  "graphql-yoga": "^5.18.1",            // HTTP handler
  "graphql-scalars": "1.25.0",          // DateTimeResolver, DateResolver
  "@pothos/core": "^4.15.1",            // Schema builder
  "@pothos/plugin-prisma": "^4.17.0",   // Integración Pothos ↔ Prisma
  "@pothos/plugin-relay": "^4.8.1",     // Paginación cursor + pageInfo

  // GraphQL cliente
  "@apollo/client": "4.2.12",           // useQuery, useMutation, cache

  // Codegen (dev)
  "@graphql-codegen/cli": "^7.4.3",
  "@graphql-codegen/client-preset": "^6.2.0",

  // UI
  "next": "^16.3.7",
  "react": "^19.3.0",
  "tailwindcss": "^4.3.3",
}
```

## 8. Scripts disponibles (`package.json`)

```bash
npm run dev              # Next en modo desarrollo
npm run build            # Build de producción
npm run start            # Servidor de producción

npm run seed             # prisma db seed → ejecuta prisma/seed.ts

npm run graphql:export   # Genera schema.graphql desde el schema Pothos
npm run graphql:codegen  # Genera gql/ desde schema.graphql + documentos
npm run graphql:sync     # export + codegen (comando habitual)
npm run graphql:watch    # codegen en modo watch
```

## 9. Flujo de trabajo diario

1. **Cambio de datos** → editar `prisma/schema.prisma` → `npx prisma migrate dev`
   (o `npx prisma db push` en prototipo) → `npx prisma generate`.
2. **Nuevo resolver/query** → crear o editar `server/modules/*.ts` → correr
   `npm run graphql:sync` (regenera `schema.graphql` y `gql/`).
3. **Nueva operación en el frontend** → escribir `graphql(\`query ...\`)` en el
   componente → `npm run graphql:codegen` → usar con `useQuery`/`useMutation`.
4. **Datos limpios** → `npm run seed` (borra y repuebla).

## 10. Estado actual y siguiente paso

**Completado:**
- Modelo de datos completo (catálogo, cotización, reserva, eventos).
- Seed realista con 90 días de inventario.
- API GraphQL de solo lectura (búsqueda + catálogo) + alta manual de hotel.
- Frontend de búsqueda con autocomplete y carrito en memoria.

**Fase 1 en curso:**
- Cerrar el ciclo `Quote → Booking` con:
  - Mutation `createQuote` (validación de inventario noche-a-noche).
  - Mutation `createBooking` (idempotencia + transacción + descuento de stock).
  - Página `/checkout` y `/reservas/[reference]`.
  - Contexto `BookingContext` que reemplaza al `CartContext`.

**Fases posteriores:**
- Autenticación real (Auth.js).
- Dashboard admin (`/admin/*`).
- Integración con proveedores externos.