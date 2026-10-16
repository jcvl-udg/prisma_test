// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { SearchBar } from '../features/search/components/SearchBar';
import { getDefaultStayDates } from '../lib/stay-dates';

describe('SearchBar default stay', () => {
  it('uses and displays a seven-night stay when dates were not entered', () => {
    const onSearchSubmit = vi.fn();
    const onDatesChange = vi.fn();
    const { container } = render(
      <SearchBar onSearchSubmit={onSearchSubmit} onDatesChange={onDatesChange} />,
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Cancún' },
    });
    fireEvent.submit(container.querySelector('form')!);

    const expectedDates = getDefaultStayDates();
    expect(onSearchSubmit).toHaveBeenCalledWith({
      query: 'Cancún',
      destinationId: undefined,
      ...expectedDates,
    });
    expect(onDatesChange).toHaveBeenCalledWith(expectedDates);
    expect(container.querySelectorAll('input[type="date"]')[0]).toHaveValue(
      expectedDates.checkIn,
    );
    expect(container.querySelectorAll('input[type="date"]')[1]).toHaveValue(
      expectedDates.checkOut,
    );
  });
});
