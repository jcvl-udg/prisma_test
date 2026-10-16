// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HotelFilterPanel } from '../features/search/components/HotelFilterPanel';
import { parseSearchFilterState } from '../features/search/filter-state';

afterEach(cleanup);

const initialState = parseSearchFilterState({
  after: 'old-cursor',
  amenity: ['POOL'],
});

const facets = {
  stars: [{ value: '4', count: 3 }, { value: '5', count: 1 }],
  propertyTypes: [{ value: 'RESORT', count: 2 }],
  themes: [{ value: 'beach', count: 2 }],
  amenities: [{ value: 'POOL', count: 2 }, { value: 'SPA', count: 1 }],
  boardTypes: [{ value: 'BREAKFAST', count: 2 }],
  cancellationTypes: [{ value: 'FREE', count: 1 }],
};

describe('HotelFilterPanel', () => {
  it('renders facet counts and emits selected filters with pagination reset', () => {
    const onChange = vi.fn();
    render(
      <HotelFilterPanel filters={initialState} facets={facets} onChange={onChange} />,
    );

    expect(screen.getByRole('option', { name: '4 estrellas (3)' })).toBeInTheDocument();
    expect(screen.getByText('Spa')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /spa/i }));
    expect(onChange).toHaveBeenCalledWith({
      ...initialState,
      amenities: ['POOL', 'SPA'],
      after: '',
      before: '',
    });
  });

  it('applies price and star filters and can clear all catalog refinements', () => {
    const onChange = vi.fn();
    render(
      <HotelFilterPanel filters={initialState} facets={facets} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Estrellas mínimas'), {
      target: { value: '4' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...initialState,
      minStars: 4,
      after: '',
      before: '',
    });

    fireEvent.change(screen.getByLabelText('Precio máximo'), {
      target: { value: '250' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...initialState,
      maxPrice: 250,
      after: '',
      before: '',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...initialState,
      minStars: undefined,
      minRating: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      propertyTypes: [],
      themes: [],
      amenities: [],
      boardTypes: [],
      cancellationTypes: [],
      after: '',
      before: '',
    });
  });
});
