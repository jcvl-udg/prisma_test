# Fase 3 — Landing interactiva y dashboard

## Estado

| Subfase | Estado | Alcance |
| --- | --- | --- |
| 3.0 — Landing interactiva | ✅ Completa | Home estática con ISR, destinos y hoteles destacados |
| 3.A — Layout `/admin` | ✅ Completa | Navegación protegida del dashboard |
| 3.B — Query `adminBookings` | ✅ Completa | Filtros y paginación cursor |
| 3.C — Lista de reservas | ✅ Completa | Filtros persistidos en URL y paginación anterior/siguiente |
| 3.D — Detalle de reserva | ✅ Completa | Datos protegidos, alojamientos e historial cronológico |
| 3.E — Transiciones de reserva | ✅ Completa | Confirmación, cancelación y auditoría |
| 3.F–3.H | Pendientes | Gestión de hoteles, métricas y vista cliente |

## 3.0 — Implementación

- La home usa `getStaticProps` con `revalidate: 60`; no carga el inventario completo ni las habitaciones.
- Consulta seis destinos destacados y doce hoteles populares con una operación GraphQL tipada contra el schema de Pothos.
- Apollo ejecuta la operación en el proceso servidor con `SchemaLink`. Así se conservan los resolvers y filtros del catálogo sin depender de una petición HTTP a la propia app durante el build o una regeneración ISR.
- Las tarjetas incluyen imágenes optimizadas con `next/image`, texto alternativo, placeholders cuando falta una imagen y enlaces a búsquedas por destino o slug de hotel.
- `/search` procesa esos parámetros y muestra resultados filtrados. Los accesos por hotel resuelven el slug de forma exacta.
- La búsqueda existente se conserva; la nueva landing no utiliza `HotelCard`, que está ligada a la selección de habitaciones y al carrito.
- Las operaciones se añadieron al codegen del cliente. No cambió el schema del servidor, por lo que esta subfase solo requiere `graphql:codegen`, no `graphql:sync`.

## Ajuste de disponibilidad: estancia predeterminada

- Si el usuario no indica fechas, la búsqueda usa hoy como entrada y una salida siete noches después, en fechas de calendario UTC.
- Las fechas se reflejan en los inputs y en los parámetros `checkIn` / `checkOut` de `/search`; las fechas explícitas válidas se conservan.
- Tanto `searchHotels` como `hotelBySlug` aplican el rango de fechas y solo devuelven hoteles con inventario disponible todas las noches solicitadas.
- `HotelCard` recibe las fechas en el contexto de reserva, por lo que la selección de habitación queda habilitada. La cotización conserva su validación final de inventario.
- El schema GraphQL se amplió en los argumentos del catálogo; al modificar `server/modules/catalog.ts` se ejecutó `npm run graphql:sync`.

## 3.A + 3.B — Administración y reservas

- `AdminLayout` aporta navegación lateral responsiva, estado activo, salida de sesión y guard frontend para `ADMIN`/`AGENT`. Los enlaces de Hoteles y Métricas se muestran deshabilitados hasta implementar sus páginas, evitando rutas 404.
- `/admin` mantiene su resumen SSR protegido por rol y consume la conexión Relay de reservas.
- `adminBookings` requiere `ADMIN` o `AGENT` en el resolver y admite `status`, `fromDate`, `toDate`, `guestEmail`, `providerCode` y `sort`.
- `fromDate` y `toDate` filtran por fecha de creación de la reserva; `toDate` incluye todo el día UTC. El email se busca sin distinguir mayúsculas y el código de proveedor filtra reservas con al menos un ítem de ese proveedor.
- La conexión usa cursor por ID, orden estable con desempate por ID y un máximo de 50 elementos por página. Ordenamientos: creación ascendente/descendente y total ascendente/descendente.
- Al cambiar el resolver/forma de `adminBookings` se ejecutó `npm run graphql:sync`.

## 3.C + 3.D — Lista y detalle administrativos

- `/admin/reservas` presenta reservas con estado, total, fecha de creación y enlace al detalle. Permite filtrar por estado, rango de fechas de creación, email de huésped y proveedor, y ordenar por fecha o total.
- Los filtros y cursores se guardan en la URL, de modo que se pueden recargar o compartir; cambiar los filtros reinicia la paginación. Las fechas de entrada impiden seleccionar un rango invertido.
- La lista pagina en ambos sentidos sobre `adminBookings`, con hasta 20 filas por página, conservando los filtros activos entre páginas.
- El tipo general `Booking` no expone campos personales. El email usado para filtrar solo se resuelve internamente y los datos personales se entregan en `adminBookingById`, protegido por rol.
- `/admin/reservas/[id]` verifica sesión y rol en SSR y vuelve a proteger las operaciones en el resolver. Muestra datos del huésped, importe, alojamientos y eventos ordenados cronológicamente.
- El layout marca activa la sección Reservas tanto en la lista como en los detalles. El resumen `/admin` enlaza a la nueva lista y los enlaces de cada fila abren el detalle administrativo, sin cambiar la ruta pública de confirmación.
- Se añadieron pruebas de permisos del detalle, datos/ítems/eventos y orden del timeline, ID inexistente, ausencia de PII en el tipo general, filtros y paginación cursor hacia adelante y atrás.

## 3.E — Transiciones de estado

- La mutation protegida `transitionAdminBooking` permite a `AGENT` y `ADMIN` confirmar reservas pendientes y cancelar reservas confirmadas, siguiendo la máquina de estados definida en Prisma.
- Las transiciones de la reserva, sus ítems, la restauración del inventario (al cancelar) y el evento de auditoría se ejecutan en una única transacción. La actualización condicional del estado evita aplicar dos veces una acción concurrente.
- Cada evento registra actor, estado anterior/nuevo y motivo opcional de cancelación; el motivo se limita a 500 caracteres.
- En el detalle administrativo se muestran acciones acordes al estado: confirmar una pendiente o cancelar una confirmada, con confirmación del navegador y motivo opcional.
- Las pruebas verifican autorización por rol, transición de estados e ítems, rechazo de confirmación duplicada, auditoría y devolución exacta de disponibilidad.

## Medición y validación

Medición local de build de producción:

| Métrica | Resultado |
| --- | ---: |
| HTML estático de `/` | 60.550 bytes |
| JSON estático de props | 6.117 bytes |
| HTML + JSON | 66.667 bytes |
| Referencia anterior reportada | 1,12 MB |
| Reducción aproximada del payload | 94% |
| TTFB local del build de producción | 33 ms |
| Revalidación ISR | 60 segundos |

El TTFB es una muestra de localhost; no representa latencia de producción ni incluye la descarga de imágenes.

Verificaciones realizadas:

- `npm run graphql:sync`
- `npx tsc --noEmit`
- Tests focalizados para default de siete noches, inputs, disponibilidad de cada noche, permisos administrativos, filtros y páginas cursor sin solapamiento.
- `npm test` — 41 pruebas en 12 archivos
- `npm run build` — home prerenderizada como SSG con revalidación de un minuto
- Navegador: seis tarjetas de destino y doce de hotel; CTA de destino devuelve hoteles de ese destino y CTA de hotel devuelve el hotel solicitado.
- `git diff --check`

## Riesgos y siguientes pasos

- La regeneración ISR necesita que la base de datos esté disponible; si una regeneración falla, Next.js conserva la última página generada y registra el error.
- TTFB, carga de imágenes y tamaño transferido deben medirse también en el entorno de despliegue.
- El siguiente bloque del dashboard es **3.F**: gestión de hoteles.
