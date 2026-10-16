// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DestinationCard } from '../features/landing/components/DestinationCard';
import { PopularHotelCard } from '../features/landing/components/PopularHotelCard';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    ...props
  }: ComponentProps<'img'> & { fill?: boolean; priority?: boolean }) => (
    <img {...props} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    'aria-label'?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const destination = {
  id: 'destination-1',
  slug: 'ciudad-de-mexico',
  name: 'Ciudad de México',
  countryCode: 'MX',
  imageUrl: 'https://picsum.photos/seed/mexico/1200/800',
  popularityScore: 90,
};

const hotel = {
  id: 'hotel-1',
  slug: 'hotel-centro',
  title: 'Hotel Centro',
  categoryStars: 4,
  ratingAvg: 9.2,
  reviewCount: 120,
  priceFrom: '125.00',
  priceCurrency: 'USD',
  mainImageUrl: 'https://picsum.photos/seed/centro/1200/800',
  destination: { name: 'Ciudad de México', code: 'MEX' },
};

describe('landing cards', () => {
  it('renders destination name, country, image, and destination search link', () => {
    render(<DestinationCard destination={destination} />);

    expect(screen.getByRole('heading', { name: 'Ciudad de México' })).toBeInTheDocument();
    expect(screen.getByText('México')).toBeInTheDocument();
    expect(screen.getByAltText('Paisaje de Ciudad de México, México')).toHaveAttribute(
      'src',
      destination.imageUrl,
    );
    expect(
      screen.getByRole('link', { name: 'Explorar hoteles en Ciudad de México' }),
    ).toHaveAttribute('href', '/search?destinationId=destination-1');
  });

  it('renders hotel title, rating, price, and hotel search link', () => {
    render(<PopularHotelCard hotel={hotel} />);

    expect(screen.getByRole('heading', { name: 'Hotel Centro' })).toBeInTheDocument();
    expect(screen.getByLabelText('Calificación 9.2 de 10')).toBeInTheDocument();
    expect(screen.getByText(/Desde.*125/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ver disponibilidad en Hotel Centro' }),
    ).toHaveAttribute('href', '/search?hotelSlug=hotel-centro');
  });

  it('shows a price inquiry message when the hotel has no starting price', () => {
    render(<PopularHotelCard hotel={{ ...hotel, priceFrom: null }} />);

    expect(screen.getByText('Consultar precio')).toBeInTheDocument();
  });

  it('shows an accessible placeholder when the hotel has no image', () => {
    render(<PopularHotelCard hotel={{ ...hotel, mainImageUrl: null }} />);

    expect(
      screen.getByRole('img', { name: 'Imagen no disponible para Hotel Centro' }),
    ).toBeInTheDocument();
  });
});
