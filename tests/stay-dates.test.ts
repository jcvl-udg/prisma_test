import { describe, expect, it } from 'vitest';
import { getDefaultStayDates, isValidStayDates } from '../lib/stay-dates';

describe('stay date defaults', () => {
  it('defaults to a seven-night stay using UTC calendar dates', () => {
    expect(getDefaultStayDates(new Date('2030-06-15T23:30:00.000Z'))).toEqual({
      checkIn: '2030-06-15',
      checkOut: '2030-06-22',
    });
  });

  it('accepts a valid date range and rejects incomplete or reversed ranges', () => {
    expect(isValidStayDates('2030-06-15', '2030-06-22')).toBe(true);
    expect(isValidStayDates('2030-06-15', undefined)).toBe(false);
    expect(isValidStayDates('2030-06-22', '2030-06-15')).toBe(false);
    expect(isValidStayDates('2030-02-30', '2030-03-05')).toBe(false);
  });
});
