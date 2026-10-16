// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { HotelCard } from '../features/catalog/components/HotelCard';
import { BookingProvider } from '../features/booking/BookingContext';

afterEach(cleanup);

describe('HotelCard attributes', () => {
  it('shows hotel type, themes and guest rating badges', () => {
    render(
      <BookingProvider>
        <HotelCard
          hotel={{
            id: 'hotel-1',
            title: 'Hotel de Playa',
            categoryStars: 4,
            propertyType: 'RESORT',
            themes: ['beach', 'family', 'wellness'],
            ratingAvg: 9.2,
            reviewCount: 120,
            destination: { name: 'Cancún', code: 'CUN' },
            rooms: [],
          }}
        />
      </BookingProvider>,
    );

    expect(screen.getByText('resort')).toBeInTheDocument();
    expect(screen.getByText('beach')).toBeInTheDocument();
    expect(screen.getByText('family')).toBeInTheDocument();
    expect(screen.queryByText('wellness')).not.toBeInTheDocument();
    expect(screen.getByText('9.2 / 10 · 120 reseñas')).toBeInTheDocument();
  });
});
