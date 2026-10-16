import { useMemo } from 'react';
import { ApolloProvider } from '@apollo/client/react';
import { SessionProvider } from 'next-auth/react';
import { createApolloClient } from "../lib/apollo-client";
import type { AppProps } from "next/app";

import { BookingProvider } from "../features/booking/BookingContext";
import '../globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  const client = useMemo(() => createApolloClient(), []);

  return (
    <SessionProvider session={pageProps.session}>
      <ApolloProvider client={client}>
        <BookingProvider>
          <Component {...pageProps} />
        </BookingProvider>
      </ApolloProvider>
    </SessionProvider>
  );
}

export default MyApp;
