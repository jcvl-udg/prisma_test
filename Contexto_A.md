# Contexto del Proyecto — Fase A (Reserva End-to-End)

Última actualización: Fase A, cierre de A3. Próximo paso: A6.

## Stack

- **Next.js 16** (Pages Router) + **React 19** + **Tailwind 4**
- **PostgreSQL** + **Prisma 7** con `@prisma/adapter-pg`
- **GraphQL Yoga 5** + **Pothos 4** (`@pothos/plugin-prisma`, `@pothos/plugin-relay`)
- **Apollo Client 4** + **GraphQL Codegen** (`client-preset`)
- **Vitest 5** para tests (no destructivos, usan fixtures efímeros)

## Estado de la Fase A

| ID | Actividad | Estado |
|---|---|---|
| A0 | Vitest + fixtures no-destructivos + smoke tests | ✅ |
| A1 | `Quote` expuesto como `prismaObject` | ✅ |
| A2 | Mutation `createQuote` + 4 tests | ✅ |
| A3 | Mutation `createBooking` + 4 tests | ✅ |
| A4 | `BookingContext` (convive con `CartContext`) | ✅ |
| A5 | Hooks `useCreateQuote` + `useCreateBooking` | ✅ |
| A6 | Página `/checkout` | ⬜ |
| A7 | Página `/reservas/[reference]` | ⬜ |
| A8 | Migrar `HotelCard`/`search.tsx` a `useBooking`, borrar `CartContext` | ⬜ |
| A9 | Verificación final (`tsc`, lint, E2E manual) | ⬜ |

## Archivos clave

### Backend GraphQL (`server/`)

- `server/builder.ts` — instancia única de Pothos. `DefaultFieldNullability: false`, scalars `Date` y `DateTime`.
- `server/context.ts` — `ctx = { prisma, user: SessionUser | null, anonymousId }`. **Ojo:** es `ctx.user`, NO `ctx.session.user`.
- `server/schema.ts` — importa los módulos (efecto secundario) y hace `builder.toSchema()`.
- `server/modules/catalog.ts` — `hotels`, `hotelsCount`, `suggestions`, `destinations`, `createManualHotel`.
- `server/modules/booking.ts` — tipos `Quote`/`Booking`/`BookingItem` + mutations `createQuote` y `createBooking`.
- `server/modules/user.ts` — `signupUser`, `createProfile` (temporales, se reemplazan por Auth.js en Fase 2).

### Cliente

- `lib/apollo-client.ts` — fábrica del ApolloClient.
- `features/booking/BookingContext.tsx` — estado de la reserva en curso: `{hotelId, roomId, checkIn, checkOut, adults, childrenAges, quoteId?, priceAmount?, currency?, expiresAt?}`.
- `features/booking/useCreateQuote.ts` — hook de la mutation `createQuote`, auto-alimenta `attachQuote`.
- `features/booking/useCreateBooking.ts` — hook de `createBooking`, genera `idempotencyKey` en `useRef` + `sessionStorage`.
- `features/booking/CartContext.tsx` — **legacy**, se borra en A8.
- `features/catalog/components/HotelCard.tsx` — legacy, usa `useCart`. Aún sin migrar.
- `features/search/components/SearchBar.tsx` — input + autocomplete + fechas.

### Tests

- `tests/smoke.test.ts` — 3 tests (conexión, fixture aislamiento, Decimal).
- `tests/quote.test.ts` — 4 tests (happy path, sin stock, fechas inválidas, sobreocupación).
- `tests/booking.test.ts` — 4 tests (happy path, idempotencia, quote expirada, decremento).
- `tests/helpers/db.ts` — `testPrisma` aislado + `disconnectTestDb`.
- `tests/helpers/fixtures.ts` — `createEphemeralHotel({ nights, price })` + `cleanup()`.
- `tests/helpers/lookup.ts` — para tests de solo-lectura sobre el seed.

## Convenciones críticas

1. **`graphql` de `../../gql`, NUNCA `gql` de Apollo.** El codegen provee tipado; Apollo `gql` no. Archivos legacy (`signup.tsx`, `create.tsx`) se dejan como están.
2. **`ctx.user`, no `ctx.session.user`.** El `context.ts` expone `SessionUser | null` con `{id, role}`.
3. **`Prisma.Decimal` con `.add()`.** Nunca `+` sobre Decimal — pierde precisión silenciosamente.
4. **Fechas `@db.Date` = UTC medianoche.** Siempre `new Date(Date.UTC(y, m, d))` o `new Date('YYYY-MM-DD')`.
5. **Tests no destructivos.** Nunca `TRUNCATE`. Cada test crea su `createEphemeralHotel` y lo limpia en `finally`.
6. **GraphQL Yoga en tests con `maskedErrors: false`.** Sin esto los errores se ven como `"Unexpected error."`.
7. **Comandos:** `npm run graphql:sync` cuando tocás `server/modules/*.ts`. `npm run graphql:codegen` cuando solo tocás documentos del frontend.

## Comandos

```bash
npm run dev              # Next dev
npm run seed             # repobla la DB con ~1000 hoteles
npm run graphql:sync     # regenera schema.graphql + gql/
npm run graphql:watch    # codegen en watch mode
npm test                 # 11 tests verdes
npx tsc --noEmit         # type check