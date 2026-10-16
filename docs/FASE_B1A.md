# Fase B1a — Schema de catálogo y Seeder v2

**Estado:** implementada y validada en una base de desarrollo/pruebas.  
**Alcance:** extensión del schema, datos sintéticos realistas, perfiles de volumen y reanudación por fases. B1b, B1c y B2 no forman parte de este cambio.

## Cambios incluidos

- `Hotel` incorpora atributos de ubicación, tipo de propiedad, cadena, reputación, temas, vibes, amenidades denormalizadas, políticas, precio y señales computadas.
- `Room` incorpora vista, plan de comidas y características de habitación.
- `PointOfInterest` y `HotelPointOfInterest` guardan POIs y distancias calculadas por destino.
- `HotelTag` permite clasificar audiencias, vibes, certificaciones y premios.
- `_SeedProgress` guarda los checkpoints; las relaciones nuevas usan borrado en cascada.
- Se agregaron índices GIN/BTREE definidos para los filtros y ordenamientos previstos en B1b.
- Las amenidades se mantienen en `Amenity`/`HotelAmenity`; `Hotel.amenityCodes` es una proyección denormalizada para búsquedas posteriores.
- El seeder genera conteos exactos de hoteles por destino, distribución de estrellas, amenidades condicionales por estrellas, 3–6 habitaciones, tres imágenes por hotel, políticas, POIs, tags y precios con estacionalidad y componente log-normal.

## Perfiles

| `SEED_PROFILE` | Hoteles | Días | Eventos |
| --- | ---: | ---: | ---: |
| `dev` (default) | 1.000 | 60 | 2.000 |
| `demo` | 3.000 | 90 | 10.000 |
| `stress` | 10.000 | 90 | 50.000 |

Ejemplos:

```bash
npx prisma migrate deploy
SEED_PROFILE=dev npm run seed
SEED_PROFILE=demo npm run seed
SEED_PROFILE=stress npm run seed
```

Compatibilidad con los overrides existentes:

- `SEED_DAYS` reemplaza los días del perfil.
- `SEED_SCALE` multiplica la cantidad de hoteles del perfil.
- `SEED_RESUME=1` retoma fases completas y procesa el primer checkpoint pendiente.
- `SEED_RESUME=0` (default) hace una limpieza completa y vuelve a comenzar.
- `SEED_BENCHMARK=1` ejecuta las consultas de referencia al terminar.

Un resume requiere que `SEED_PROFILE`, `SEED_DAYS` y `SEED_SCALE` produzcan la misma configuración que la ejecución interrumpida. Si no coincide, el script falla antes de modificar datos. Una interrupción durante una fase no confirmada hace que esa fase se limpie y se regenere. Los hoteles se checkpoint-ean por destino; setup, usuarios, reservas y señales se checkpoint-ean por fase.

> **Seguridad:** este seeder vacía y vuelve a poblar tablas de la aplicación. Tiene una protección para `NODE_ENV=production`, pero se debe ejecutar solo contra una base de desarrollo o prueba descartable. No ejecutar contra datos que deban conservarse.

## Rendimiento y límites

- Los `createMany` se envían en chunks de 500.
- En el perfil `stress`, el inventario usa PostgreSQL `COPY FROM STDIN` con `pg-copy-streams`; si la operación de COPY falla, se informa el error y se reintenta mediante `createMany` con `skipDuplicates`.
- El pool se cierra en el bloque final incluso si el seed falla.
- Se midió el perfil `dev` y se probó COPY con filas temporales en la base confirmada; el perfil `stress` no se ejecutó.
- Los objetivos de filas descritos en el prompt original no coinciden con los tamaños del catálogo: con 3–6 habitaciones por hotel, el promedio esperado es aproximadamente 4,5, por lo que el inventario estimado es 270k filas en dev, 1,215M en demo y 4,05M en stress. Los objetivos de 60k/270k/900k requieren reducir hoteles, habitaciones o días.
- La medición de planes de consulta y uso de índices corresponde a B1b; ver [`FASE_B1B.md`](./FASE_B1B.md).
- La distribución de amenidades, estrellas, perfiles y encoding del COPY tiene cobertura unitaria. También se verificaron contra los datos sembrados Cancún, imágenes, habitaciones, inventario y la distribución de amenidades.
- El catálogo está definido en el seeder actual; la separación exhaustiva de cada plantilla a archivos JSON no se hizo porque no mejora la ejecución ni la seguridad de esta entrega.

## Verificación realizada

- `npx prisma validate` — correcto.
- `npx prisma generate` — cliente y tipos Pothos regenerados.
- `npx tsc --noEmit --pretty false` — correcto.
- `npx vitest run tests/seeder.test.ts` — 13 pruebas correctas.
- `npm test` — 59 pruebas en 14 archivos correctas.
- `npm run build` — correcto con el schema migrado.
- `git diff --check` sobre los archivos editados a mano pasó antes de la regeneración final de artefactos Prisma.
- Migración aplicada a la base confirmada de desarrollo/pruebas.
- Seed dev medido en **160,5 s**: 1.000 hoteles, 4.477 habitaciones, 268.620 noches, 62 usuarios, 180 reservas y 2.000 eventos.
- Reanudación verificada: `SEED_PROFILE=dev SEED_RESUME=1 npm run seed` reconoció todos los checkpoints y finalizó en 5,6 s sin recrear datos.
- Comprobación de solo lectura posterior al corte eléctrico: `prisma migrate status` confirmó el schema actualizado; se conservaron 1.000 hoteles, 4.477 habitaciones, 268.620 noches, 62 usuarios, 2.000 eventos y 36 checkpoints. La tabla de reservas tiene ahora 187 filas; la ejecución inicial del seed creó 180. No se eliminaron filas adicionales durante esta comprobación.
- COPY real probado con dos filas temporales; ambas se insertaron y leyeron, y después se eliminaron.
- Distribución real del perfil dev:
  - Estrellas: 2★ 7,3%, 3★ 31,6%, 4★ 38,7%, 5★ 22,4%.
  - Hoteles 5★: SPA 89,3%, alberca 96%, restaurante 87,9%.
  - Cancún: 52 hoteles; buckets con resultados: económico 32, medio 7, premium 11, lujo 2.
  - Amenidades por hotel 4–12; imágenes por hotel 3; habitaciones por hotel 3–6; inventario por habitación 60 noches.
  - Entre hoteles tematizados `beach`, 48,8% queda a menos de 500 m; entre hoteles `city`, 60,1% queda a menos de 1 km del metro.

La migración aditiva está en [`prisma/migrations/20261016215000_b1a_catalog_seed/migration.sql`](../prisma/migrations/20261016215000_b1a_catalog_seed/migration.sql).
