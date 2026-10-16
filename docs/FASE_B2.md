# Fase B2 — Arquitectura de providers

**Estado:** infraestructura implementada localmente; validación con Redis/Valkey real y conexión de proveedores externos pendientes.

## Componentes implementados

- `ProviderClient` define búsqueda, disponibilidad, cotización, reserva, cancelación y health check.
- `LocalProviderClient` usa PostgreSQL como fuente de verdad para el catálogo y el inventario. Las mutaciones GraphQL de cotización y reserva pasan por el router y vuelven a leer el registro con la selección Pothos solicitada.
- La reserva local conserva el snapshot, el evento `CREATED`, la transacción de inventario y la idempotencia. Las solicitudes concurrentes con la misma clave se resuelven con una sola reserva y un solo decremento.
- `ProviderRegistry` valida códigos únicos; `ProviderRouter` aplica límites, circuit breaker y cache cuando corresponde.
- La disponibilidad de `LOCAL` siempre consulta PostgreSQL. No se cachea disponibilidad local para evitar vender inventario obsoleto. Para proveedores remotos se configura TTL de 5 minutos para disponibilidad y 1 hora para tarifas.
- El límite es de 10 operaciones por segundo y 10 cotizaciones por minuto por usuario/identidad, mediante `rate-limiter-flexible`. El circuit breaker se abre tras 5 fallos reintentables y expira a los 30 segundos.
- BullMQ proporciona `provider.book`, `provider.cancel`, `provider.syncCatalog` y `provider.refreshPriceFrom`, con identificadores deterministas derivados de la clave de idempotencia, hasta 5 intentos y backoff exponencial.
- El worker valida los payloads y recibe handlers explícitos para cada tipo de trabajo. No se configura un worker de negocio por defecto: aún no existen proveedores externos que ejecuten esas operaciones.
- `POST /api/webhooks/[provider]` limita el cuerpo a 1 MiB, acepta JSON y exige una firma `sha256=<hex>` calculada con HMAC-SHA256 sobre los bytes originales. El secreto se busca en `PROVIDER_WEBHOOK_SECRET_<CODIGO>`, y el evento se delega solo a un cliente con `handleWebhook`.

## Configuración

En el entorno de despliegue se debe configurar **una** de estas variables:

- `REDIS_URL`
- `VALKEY_URL`

También se debe definir un secreto independiente por cada proveedor que reciba webhooks, por ejemplo `PROVIDER_WEBHOOK_SECRET_HOTELBEDS`. Los valores deben ser secretos aleatorios, guardados en el gestor de secretos del hosting; no se deben subir a Git ni registrar en logs.

Fuera de `NODE_ENV=test`, los servicios de provider que usan circuit breaker, rate limiter o cache requieren Redis/Valkey. Si falta la conexión, el sistema falla explícitamente en vez de sustituirla silenciosamente por memoria.

## Límites y riesgos conocidos

- Esta ejecución local no tiene `REDIS_URL` ni `VALKEY_URL`; por eso no se pudo verificar conexión Redis, operaciones Lua, límites distribuidos, TTL en servidor Redis, persistencia de la queue ni procesamiento BullMQ.
- La cola no está conectada a `createBooking`: la reserva local ya confirma inventario en una transacción síncrona. Encolar el mismo efecto produciría reservas o decrementos duplicados. La integración de `provider.book` debe ocurrir cuando exista una operación remota diferenciada y su contrato de idempotencia.
- `LocalProviderClient.cancelBooking` rechaza la operación. La cancelación del inventario propio sigue siendo responsabilidad de la transición administrativa existente; no se devuelve una falsa confirmación de cancelación.
- No hay clientes externos registrados en el router ni handlers de producción para los jobs. El webhook verifica y delega el evento, pero no actualiza reservas por sí mismo.
- Las ventanas de rate limiting Redis y el circuit breaker se basan en el estado Redis compartido; deben probarse con una instancia de staging antes de habilitarlos en producción.

## Pruebas y verificación

- `tests/providers.test.ts`: circuito en memoria (incluida apertura/cierre), límites en memoria, cache TTL, registry, despacho de jobs, claves idempotentes de jobs y firmas HMAC válidas/inválidas.
- `tests/booking.test.ts`: reserva local, expiración, decremento de inventario e idempotencia secuencial y concurrente con Prisma real.
- Pruebas focalizadas ejecutadas: 13 tests correctos en `tests/booking.test.ts` y `tests/providers.test.ts`.
- Suite completa tras la implementación: 71 tests correctos en 17 archivos.
- `npx tsc --noEmit --pretty false`: correcto.
- Las pruebas unitarias de infraestructura no sustituyen una validación end-to-end con Redis/Valkey real.
