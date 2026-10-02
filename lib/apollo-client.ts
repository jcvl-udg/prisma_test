import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

// Exportamos una función en lugar de una instancia global estática
export function createApolloClient() {
  const isServer = typeof window === "undefined";

  // Determinamos la URL correcta basándonos en el entorno
  let graphqlUri = "/api/graphql"; // Default: URL relativa para el navegador (Cliente)

  if (isServer) {
    if (process.env.VERCEL_URL) {
      // Vercel inyecta VERCEL_URL sin el protocolo, así que agregamos https://
      graphqlUri = `https://${process.env.VERCEL_URL}/api/graphql`;
    } else {
      // Entorno de desarrollo local
      graphqlUri = "http://localhost:3000/api/graphql";
    }
  }

  return new ApolloClient({
    ssrMode: isServer, 
    link: new HttpLink({
      uri: graphqlUri,
    }),
    cache: new InMemoryCache(),
  });
}