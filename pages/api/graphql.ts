import { createYoga } from 'graphql-yoga';
import type { NextApiRequest, NextApiResponse } from 'next';
import { schema } from '../../server/schema';
import { createContext } from '../../server/context';

const isProd = process.env.NODE_ENV === 'production';

export default createYoga<{ req: NextApiRequest; res: NextApiResponse }>({
  schema,
  graphqlEndpoint: '/api/graphql',
  // GraphiQL (el playground) solo en desarrollo
  graphiql: !isProd,
  // En producción los errores inesperados se enmascaran: el cliente ve un mensaje
  // genérico y no detalles internos (SQL, rutas, stack traces).
  maskedErrors: { isDev: !isProd },
  // Se ejecuta una vez por petición y construye `ctx` para los resolvers
  context: ({ req }) => createContext(req),
});

// Yoga lee el cuerpo por sí mismo: Next no debe parsearlo antes
export const config = {
  api: { bodyParser: false },
};
