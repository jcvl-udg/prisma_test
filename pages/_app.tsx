import { ApolloProvider } from "@apollo/client/react";
import { createApolloClient } from "../lib/apollo-client";
import type { AppProps } from "next/app";

import { CartProvider } from "../context/CartContext"
import '../globals.css'; // Tailwind CSS

function MyApp({ Component, pageProps }: AppProps) {
  const client = createApolloClient();

  return (
    <ApolloProvider client={client}>
      <CartProvider>
        <Component {...pageProps} />
      </CartProvider>
    </ApolloProvider>
  );
}

export default MyApp;
