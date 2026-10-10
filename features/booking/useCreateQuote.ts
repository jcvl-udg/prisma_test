import { useMutation } from '@apollo/client/react';
import { graphql } from '../../gql';
import { useBooking } from './BookingContext';

const CREATE_QUOTE_MUTATION = graphql(`
  mutation CreateQuote(
    $hotelId: String!
    $roomId: String!
    $checkIn: Date!
    $checkOut: Date!
    $adults: Int!
    $childrenAges: [Int!]!
  ) {
    createQuote(
      hotelId: $hotelId
      roomId: $roomId
      checkIn: $checkIn
      checkOut: $checkOut
      adults: $adults
      childrenAges: $childrenAges
    ) {
      id
      priceAmount
      currency
      expiresAt
    }
  }
`);

export interface CreateQuoteInput {
  hotelId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  childrenAges: number[];
}

export function useCreateQuote() {
  const { attachQuote } = useBooking();

  const [mutate, state] = useMutation(CREATE_QUOTE_MUTATION, {
    onCompleted: (data) => {
      const q = data?.createQuote;
      if (!q) return;
      attachQuote({
        quoteId: q.id,
        priceAmount: Number(q.priceAmount),
        currency: q.currency,
        expiresAt: q.expiresAt,
      });
    },
  });

  const createQuote = (input: CreateQuoteInput) =>
    mutate({ variables: input });

  return { createQuote, ...state };
}