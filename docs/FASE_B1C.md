# Fase B1c — DataLoader y eliminación de N+1

**Estado:** completada y medida en la base de desarrollo.  
**Alcance:** verificar el batching de relaciones Prisma expuestas por Pothos en catálogo, reservas y usuario; evitar agregar un DataLoader redundante si el plugin actual ya cumple el objetivo.

## Diagnóstico y decisión

Los tipos GraphQL de catálogo, reservas y usuario declaran relaciones con `t.relation(...)`. El `PrismaPlugin` de Pothos recibe la selección GraphQL completa y la integra en la consulta Prisma del resolver padre; las relaciones se cargan por lotes, no con un resolver/query independiente por hotel.

Se mantuvo `onUnusedQuery: 'warn'` en desarrollo. La medición real para 20 hoteles que solicita `destination`, `rooms`, `amenities { amenity }` e `images` dio **6 consultas SQL**. El límite definido en el prompt es **10**, por lo que no se añadió `@pothos/plugin-dataloader`: no aporta una mejora demostrada frente al batching ya observado y agregaría complejidad y dependencia.

La conclusión aplica a las relaciones declaradas mediante `t.relation(...)` y optimizadas por Pothos Prisma. Si se añade un resolver relacional personalizado que consulte Prisma dentro de cada elemento, debe medirse y batchearse explícitamente.

## Prueba de regresión

`tests/n1-elimination.test.ts` crea fixtures efímeros, registra eventos `query` de Prisma y ejecuta la consulta GraphQL sobre 20 hoteles con las cuatro ramas de relaciones. Verifica que todas las relaciones estén pobladas y que el total de consultas no supere 10. Las escrituras de los fixtures ocurren antes de iniciar la medición y se eliminan al terminar.

```graphql
hotels(first: 20) {
  edges {
    node {
      destination { name }
      rooms { name }
      amenities { amenity { name } }
      images { url }
    }
  }
}
```

## Verificación

- `tests/n1-elimination.test.ts` — correcto; **6 consultas SQL** para 20 hoteles y sus relaciones.
- `npx tsc --noEmit --pretty false` — correcto.
- No se instaló `@pothos/plugin-dataloader`; el objetivo ya se cumple con el plugin Prisma existente.
- B1b backend/facets está disponible; la UI de filtros facetados descrita en el prompt sigue pendiente y se documenta como alcance no cerrado.
- B2 se inicia en un checkpoint posterior a la validación de B1c; su avance y limitaciones están documentados en [`docs/FASE_B2.md`](./FASE_B2.md).
