import { ApolloProvider } from "@apollo/client/react";
import { createApolloClient } from "../lib/apollo-client";
import type { AppProps } from "next/app";

import { BookingProvider } from "../features/booking/BookingContext";
import '../globals.css'; // Tailwind CSS

function MyApp({ Component, pageProps }: AppProps) {
  const client = createApolloClient();

  return (
    <ApolloProvider client={client}>
      <BookingProvider> 
        <Component {...pageProps} />
      </BookingProvider>
    </ApolloProvider>
  );
}

export default MyApp;
