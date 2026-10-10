import { useMutation } from '@apollo/client/react';
import { useEffect, useRef } from 'react';
import { graphql } from '../../gql';   // ← aquí también

const CREATE_BOOKING_MUTATION = graphql(`
  mutation CreateBooking(
    $quoteId: String!
    $idempotencyKey: String!
    $guestName: String!
    $guestEmail: String!
    $guestPhone: String
  ) {
    createBooking(
      quoteId: $quoteId
      idempotencyKey: $idempotencyKey
      guestName: $guestName
      guestEmail: $guestEmail
      guestPhone: $guestPhone
    ) {
      id
      reference
      status
      totalAmount
      currency
    }
  }
`);

// ... resto igual que antes
export interface CreateBookingInput {
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
}

function readOrCreateKey(quoteId: string): string {
  const storageKey = `booking:${quoteId}`;
  if (typeof window === 'undefined') return crypto.randomUUID();
  const stored = window.sessionStorage.getItem(storageKey);
  if (stored) return stored;
  const fresh = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, fresh);
  return fresh;
}

export function useCreateBooking(quoteId: string | undefined) {
  const keyRef = useRef<string | null>(null);

  // Inicializa la key una vez por (quoteId, pestaña). Si el usuario
  // refresca, la key se lee de sessionStorage y el server-side idempotency
  // detecta el intento como duplicado.
  useEffect(() => {
    if (!quoteId || keyRef.current) return;
    keyRef.current = readOrCreateKey(quoteId);
  }, [quoteId]);

  const [mutate, state] = useMutation(CREATE_BOOKING_MUTATION);

  const createBooking = (input: CreateBookingInput) => {
    if (!quoteId) throw new Error('createBooking llamado sin quoteId');
    // Fallback por si el useEffect aún no corrió (SSR + click prematuro)
    if (!keyRef.current) keyRef.current = readOrCreateKey(quoteId);

    return mutate({
      variables: {
        quoteId,
        idempotencyKey: keyRef.current,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        guestPhone: input.guestPhone ?? null,
      },
    });
  };

  return { createBooking, ...state };
}