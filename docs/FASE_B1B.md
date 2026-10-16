# Fase B1b — Búsqueda y facets del catálogo

**Estado:** backend implementado y validado en desarrollo; UI pendiente.
**Alcance:** búsqueda GraphQL del catálogo, facets de resultados y verificación de consultas/índices. B1c y B2 quedan fuera de esta entrega.

## Búsqueda y facets

La query `hotels(filter, sort, first, after)` es la búsqueda paginada recomendada. El endpoint legado `searchHotels` se conserva para los clientes actuales. `hotelFacets(filter)` reutiliza exactamente los filtros de catálogo y devuelve:

- `total`: número de hoteles que coinciden con el filtro.
- `stars`, `propertyTypes`, `themes`, `amenities`, `boardTypes`, `cancellationTypes` y `priceBuckets`: valores disponibles y cantidad de hoteles por valor.

Los conteos se calculan sobre los hoteles que coinciden con todos los filtros recibidos. Los valores se agregan en PostgreSQL; la query selecciona únicamente los IDs de hoteles coincidentes para aplicar el mismo predicado de búsqueda sin reconstruirlo por separado. La agregación y selección de IDs se ejecutan en una transacción `RepeatableRead` para dar una respuesta consistente ante cambios concurrentes.

Ejemplo:

```graphql
query SearchFacets($filter: HotelFilter) {
  hotels(filter: $filter, first: 20) {
    edges { node { id title categoryStars } }
    pageInfo { hasNextPage endCursor }
  }
  hotelFacets(filter: $filter) {
    total
    stars { value count }
    amenities { value count }
    themes { value count }
    priceBuckets { value count }
  }
}
```

La query `hotelsCount` sigue disponible cuando el cliente solo necesita el total; no es necesario solicitar todas las facets en cada búsqueda.

## Criterios de consulta e índices

- Los filtros de estado, destino, estrellas, precio y texto usan los predicados de `buildHotelWhere`; no se aplica a resultados el endpoint de sugerencias.
- La disponibilidad valida que cada habitación tenga una fila libre para cada noche solicitada. Entrada/salida parciales, fechas pasadas y estancias superiores a 30 noches se rechazan.
- La búsqueda usa orden determinista con `id` como desempate y límite de 50 resultados por página.
- Los índices no se consideran útiles solo por existir en el schema. Medir con datos representativos y comprobar `EXPLAIN (ANALYZE, BUFFERS)` para los filtros y ordenamientos reales; contrastar latencia y filas leídas, no exigir `Index Scan` si el planificador elige correctamente un scan secuencial para una tabla pequeña.
- El alcance original de B1b también pide el panel de filtros, chips activos, badges de hotel y estado de filtros en la URL. Esas piezas de UI siguen pendientes; la query `hotelFacets` sí está lista para consumirlas. El endpoint legacy no se elimina en B1b.

Consulta de referencia para explicar y ajustar a un destino real:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM "Hotel"
WHERE status = 'ACTIVE'::"HotelStatus"
  AND "destinationId" = '<destination-id>'
  AND "categoryStars" >= 4
ORDER BY "popularityScore" DESC, id ASC
LIMIT 20;
```

Medición real con el seed dev (1.000 hoteles), usando Cancún, estado `ACTIVE`, mínimo cuatro estrellas y orden popular:

- El plan usó `Hotel_destinationId_status_categoryStars_priceFrom_idx` mediante `Bitmap Index Scan` + `Bitmap Heap Scan`.
- Encontró 30 hoteles candidatos y devolvió los 20 solicitados; el orden final se resolvió con un sort en memoria.
- Ejecución: **6,287 ms**; planificación: **8,245 ms**; 9 bloques compartidos leídos desde caché y cero bloques físicos.
- Una búsqueda por `searchKey LIKE '%cancun%'` recorrió el índice de estado/popularidad y terminó con sort incremental: **25,486 ms** de ejecución, cero bloques físicos. Un filtro `amenityCodes @> ARRAY['POOL']` también usó el índice de estado/popularidad y terminó en **0,453 ms**. En esta cardinalidad el planificador prefirió recuperar el orden popular y filtrar, en lugar de elegir los índices trigram/GIN.
- Es una muestra pequeña y caliente; no representa latencia de producción ni demuestra rendimiento bajo concurrencia. Volver a medir con perfiles demo/stress antes de ajustar índices adicionales.

No ejecutar benchmarks de carga contra producción.

## Verificación realizada

- Tests GraphQL de facets y disponibilidad — 3 correctos.
- `npm test` — 61 pruebas en 15 archivos correctas.
- `npm run build` — correcto, incluyó la comprobación de TypeScript.
- `npm run graphql:sync` — exportó el schema y regeneró tipos de cliente.
- `git diff --check` sobre los archivos editados a mano — correcto.
- B1a permanece sin commit junto con estos cambios; no se ejecutó nuevamente el seed destructivo.

## Pruebas

- Query GraphQL sobre dos hoteles aislados: conteos de facets y filtro compartido.
- Caso sin coincidencias: `total = 0` y listas vacías.
- Conservar y correr `tests/search-availability.test.ts` para validar disponibilidad del buscador.

## No incluido

- UI de filtros/facets (pendiente respecto al prompt original).
- Retirada de `searchHotels`.
- Cambios en providers, recomendación o indexación de B1c/B2.
