# Fase B2 — Arquitectura de providers

**Estado:** infraestructura local implementada y validada contra Upstash por TCP/TLS; la integración con proveedores externos queda pendiente.

## Componentes implementados

- `ProviderClient` define búsqueda, disponibilidad, cotización, reserva, cancelación y health check.
- `LocalProviderClient` usa PostgreSQL como fuente de verdad para el catálogo y el inventario. Las mutaciones GraphQL de cotización y reserva pasan por el router y vuelven a leer el registro con la selección Pothos solicitada.
- La reserva local conserva el snapshot, el evento `CREATED`, la transacción de inventario y la idempotencia. Las solicitudes concurrentes con la misma clave se resuelven con una sola reserva y un solo decremento.
- `ProviderRegistry` valida códigos únicos; `ProviderRouter` aplica límites, circuit breaker y cache cuando corresponde.
- La disponibilidad de `LOCAL` siempre consulta PostgreSQL. No se cachea disponibilidad local para evitar vender inventario obsoleto. Para proveedores remotos se configura TTL de 5 minutos para disponibilidad y 1 hora para tarifas.
- El límite es de 10 operaciones por segundo y 10 cotizaciones por minuto por usuario/identidad, mediante `rate-limiter-flexible`. El circuit breaker se abre tras 5 fallos reintentables y expira a los 30 segundos.
- BullMQ proporciona `provider.book`, `provider.cancel`, `provider.syncCatalog` y `provider.refreshPriceFrom`, con identificadores deterministas derivados de la clave de idempotencia, hasta 5 intentos y backoff exponencial.
- El worker valida los payloads y recibe handlers explícitos para cada tipo de trabajo. No se configura un worker de negocio por defecto: aún no existen proveedores externos que ejecuten esas operaciones.
- La cola/worker se probaron con Upstash real: encolado, deduplicación, ejecución, un fallo temporal seguido de retry y limpieza de una cola temporal aislada.
- `POST /api/webhooks/[provider]` limita el cuerpo a 1 MiB, acepta JSON y exige una firma `sha256=<hex>` calculada con HMAC-SHA256 sobre los bytes originales. El secreto se busca en `PROVIDER_WEBHOOK_SECRET_<CODIGO>`, y el evento se delega solo a un cliente con `handleWebhook`.

## Configuración

La aplicación usa `ioredis` y necesita el endpoint **TCP/TLS** de Upstash, no las credenciales REST (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). En Upstash Console abre la base de datos → **Connect → TCP** y copia la URL TLS completa al `.env` local, que está ignorado por Git:

```dotenv
REDIS_URL="rediss://default:<TOKEN>@<ENDPOINT>:<PORT>"
```

Usa los valores proporcionados por la consola; TLS es obligatorio. Si se prefiere Valkey, la alternativa es `VALKEY_URL`. No publiques ni pegues el token en el chat. En producción, guarda el mismo valor como secreto del entorno de despliegue.

También se debe definir un secreto independiente por cada proveedor que reciba webhooks, por ejemplo `PROVIDER_WEBHOOK_SECRET_HOTELBEDS`. Los valores deben ser secretos aleatorios, guardados en el gestor de secretos del hosting; no se deben subir a Git ni registrar en logs.

Fuera de `NODE_ENV=test`, los servicios de provider que usan circuit breaker, rate limiter, cache o BullMQ requieren Redis/Valkey. Si falta la conexión, el sistema falla explícitamente en vez de sustituirla silenciosamente por memoria.

Para comprobar el endpoint sin revelar credenciales:

```bash
npm run providers:redis-check
npm test -- tests/providers-redis.integration.test.ts
```

El comando de comprobación hace `PING`, comprueba escritura/lectura del cache y TTL, utiliza una clave aleatoria de prueba y la elimina al terminar. La prueba de integración de Vitest se ejecuta cuando `REDIS_URL` o `VALKEY_URL` está definido; sin ellos queda omitida de forma explícita. El cache remoto se aplica solo a availability/rates de providers remotos; el inventario `LOCAL` siempre va a PostgreSQL.

## Límites y riesgos conocidos

- La conexión TCP/TLS de Upstash se verificó localmente con `PING`, lectura/escritura de cache, TTL, operación Lua del circuit breaker, límites distribuidos y ciclo encolado/worker/retry de BullMQ. No se probó carga ni concurrencia a escala.
- La cola no está conectada a `createBooking`: la reserva local ya confirma inventario en una transacción síncrona. Encolar el mismo efecto produciría reservas o decrementos duplicados. La integración de `provider.book` debe ocurrir cuando exista una operación remota diferenciada y su contrato de idempotencia.
- `LocalProviderClient.cancelBooking` rechaza la operación. La cancelación del inventario propio sigue siendo responsabilidad de la transición administrativa existente; no se devuelve una falsa confirmación de cancelación.
- No hay clientes externos registrados en el router ni handlers de producción para los jobs. El webhook verifica y delega el evento, pero no actualiza reservas por sí mismo.
- Las ventanas de rate limiting Redis y el circuit breaker se basan en el estado Redis compartido; deben probarse con una instancia de staging antes de habilitarlos en producción.

## Pruebas y verificación

- `tests/providers.test.ts`: circuito en memoria (incluida apertura/cierre), límites en memoria, cache TTL y política del router (cache remoto, bypass local), registry, despacho de jobs, claves idempotentes de jobs y firmas HMAC válidas/inválidas.
- `tests/providers-redis.integration.test.ts` y `npm run providers:redis-check`: conexión/cache, circuit breaker Lua, rate limits distribuidos y ciclo BullMQ/retry verificados contra Upstash TCP/TLS.
- `tests/booking.test.ts`: reserva local, expiración, decremento de inventario e idempotencia secuencial y concurrente con Prisma real.
- Las suites completas y las cifras finales de esta entrega se registran en `docs/FASE_3.md`.
- `npx tsc --noEmit --pretty false`: correcto.
- Las pruebas de queue validan la infraestructura con handlers de prueba; no sustituyen la integración con las APIs ni idempotencia de un proveedor externo real.
