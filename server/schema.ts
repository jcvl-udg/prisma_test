import { builder } from './builder';

// Importar un módulo basta para registrar sus tipos, queries y mutations en `builder`.
// Si creas un módulo nuevo (p. ej. analytics.ts), agrégalo aquí.
import './modules/catalog';
import './modules/booking';
import './modules/user';

// Se exporta el esquema ya construido para poder usarlo en:
//   - pages/api/graphql.ts      (servidor)
//   - scripts/export-schema.ts  (genera schema.graphql para Codegen)
//   - tests de integración
export const schema = builder.toSchema();
