import type { CodegenConfig } from '@graphql-codegen/cli';

// Codegen lee DOS cosas y genera los tipos del CLIENTE:
//   1) schema.graphql  -> lo que el servidor ofrece (lo exporta scripts/export-schema.ts)
//   2) documents       -> las queries/mutations que escribes en el frontend
const config: CodegenConfig = {
  schema: './schema.graphql',
  documents: ['features/**/*.{ts,tsx}', 'pages/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
  ignoreNoDocuments: true, // no falla si todavía no hay queries tipadas
  generates: {
    './gql/': {
      preset: 'client',
      // Sin "fragment masking": más simple para empezar (los componentes ven todos los campos)
      presetConfig: { fragmentMasking: false },
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
        avoidOptionals: true,
        // Cómo viajan los scalars personalizados por JSON
        scalars: { DateTime: 'string', Date: 'string', Decimal: 'string' },
      },
    },
  },
};

export default config;