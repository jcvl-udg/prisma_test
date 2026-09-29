import { ApolloProvider } from "@apollo/client/react";
import client from "../lib/apollo-client";
import type { AppProps } from "next/app";

import { CartProvider } from "../context/CartContext"
import '../globals.css'; // Tailwind CSS

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ApolloProvider client={client}>
      <CartProvider>
        <Component {...pageProps} />
      </CartProvider>
    </ApolloProvider>
  );
}

export default MyApp;
