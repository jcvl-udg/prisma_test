# Fase 3 — Landing interactiva y dashboard

## Estado

| Subfase | Estado | Alcance |
| --- | --- | --- |
| 3.0 — Landing interactiva | ✅ Completa | Home estática con ISR, destinos y hoteles destacados |
| 3.A — Layout `/admin` | Pendiente | Navegación protegida del dashboard |
| 3.B — Query `adminBookings` | Pendiente | Filtros y paginación cursor |
| 3.C–3.H | Pendientes | Páginas, transiciones, hoteles, métricas y vista cliente |

## 3.0 — Implementación

- La home usa `getStaticProps` con `revalidate: 60`; no carga el inventario completo ni las habitaciones.
- Consulta seis destinos destacados y doce hoteles populares con una operación GraphQL tipada contra el schema de Pothos.
- Apollo ejecuta la operación en el proceso servidor con `SchemaLink`. Así se conservan los resolvers y filtros del catálogo sin depender de una petición HTTP a la propia app durante el build o una regeneración ISR.
- Las tarjetas incluyen imágenes optimizadas con `next/image`, texto alternativo, placeholders cuando falta una imagen y enlaces a búsquedas por destino o slug de hotel.
- `/search` procesa esos parámetros y muestra resultados filtrados. Los accesos por hotel resuelven el slug de forma exacta.
- La búsqueda existente se conserva; la nueva landing no utiliza `HotelCard`, que está ligada a la selección de habitaciones y al carrito.
- Las operaciones se añadieron al codegen del cliente. No cambió el schema del servidor, por lo que esta subfase solo requiere `graphql:codegen`, no `graphql:sync`.

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

- `npm run graphql:codegen`
- `npx tsc --noEmit`
- `npm test` — 32 pruebas en 8 archivos
- `npm run build` — home prerenderizada como SSG con revalidación de un minuto
- Navegador: seis tarjetas de destino y doce de hotel; CTA de destino devuelve hoteles de ese destino y CTA de hotel devuelve el hotel solicitado.
- `git diff --check`

## Riesgos y siguientes pasos

- La regeneración ISR necesita que la base de datos esté disponible; si una regeneración falla, Next.js conserva la última página generada y registra el error.
- TTFB, carga de imágenes y tamaño transferido deben medirse también en el entorno de despliegue.
- El siguiente entregable recomendado es **3.A + 3.B**: layout administrativo y query `adminBookings` protegida con filtros y paginación.
