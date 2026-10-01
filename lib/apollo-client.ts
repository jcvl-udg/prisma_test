import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

// Exportamos una función en lugar de una instancia global estática
export function createApolloClient() {
  const isServer = typeof window === "undefined";

  return new ApolloClient({
    // Activa optimizaciones para servidor si estamos en el servidor
    ssrMode: isServer, 
    link: new HttpLink({
      // URL absoluta en servidor, relativa en el cliente
      uri: isServer 
        ? "http://localhost:3000/api/graphql" // Usa una env var en producción (ej. process.env.NEXT_PUBLIC_API_URL)
        : "/api/graphql",
    }),
    cache: new InMemoryCache(),
  });
}