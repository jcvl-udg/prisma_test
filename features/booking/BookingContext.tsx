import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export interface BookingSelection {
  id: string;
  hotelId: string;
  hotelName: string;
  roomId: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  childrenAges: number[];
  quoteId?: string;
  priceAmount?: number;
  currency?: string;
  expiresAt?: string;
}

export interface BookingDates {
  checkIn: string;
  checkOut: string;
}

interface AttachQuotePayload {
  quoteId: string;
  priceAmount: number;
  currency: string;
  expiresAt: string;
}

interface BookingContextValue {
  selection: BookingSelection | null;
  setSelection: (s: BookingSelection | null) => void;
  attachQuote: (p: AttachQuotePayload) => void;
  clear: () => void;
  // 👇 nuevos
  dates: BookingDates | null;
  setDates: (d: BookingDates | null) => void;
}

const BookingContext = createContext<BookingContextValue | undefined>(undefined);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<BookingSelection | null>(null);
  const [dates, setDates] = useState<BookingDates | null>(null);

  const attachQuote = useCallback((p: AttachQuotePayload) => {
    setSelection((prev) => (prev ? { ...prev, ...p } : prev));
  }, []);

  const clear = useCallback(() => {
    setSelection(null);
    // NO limpiamos `dates`: el usuario suele seguir buscando con las mismas fechas.
  }, []);

  return (
    <BookingContext.Provider
      value={{ selection, setSelection, attachQuote, clear, dates, setDates }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking debe usarse dentro de BookingProvider');
  return ctx;
}