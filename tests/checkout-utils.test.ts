import { describe, expect, it } from 'vitest';
import {
  toMs,
  formatCountdown,
  isQuoteExpired,
} from '../features/booking/checkout-utils';

describe('checkout-utils', () => {
  it('toMs parsea ISO, Date y number; null para inválidos', () => {
    const iso = '2026-03-01T12:00:00.000Z';
    expect(toMs(iso)).toBe(new Date(iso).getTime());
    expect(toMs(new Date(iso))).toBe(new Date(iso).getTime());
    expect(toMs(0)).toBe(0);
    expect(toMs(null)).toBeNull();
    expect(toMs(undefined)).toBeNull();
    expect(toMs('no-es-fecha')).toBeNull();
  });

  it('formatCountdown renderiza mm:ss y clampa a 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-500)).toBe('00:00');
    expect(formatCountdown(59_000)).toBe('00:59');
    expect(formatCountdown(60_000)).toBe('01:00');
    expect(formatCountdown(29 * 60_000 + 30_000)).toBe('29:30');
  });

  it('isQuoteExpired compara expiresAt contra now', () => {
    const now = Date.parse('2026-03-01T12:00:00Z');
    expect(isQuoteExpired('2026-03-01T11:59:59Z', now)).toBe(true);
    expect(isQuoteExpired('2026-03-01T12:00:00Z', now)).toBe(true); // <= now
    expect(isQuoteExpired('2026-03-01T12:00:01Z', now)).toBe(false);
    expect(isQuoteExpired(null, now)).toBe(false);
    expect(isQuoteExpired(undefined, now)).toBe(false);
  });
});