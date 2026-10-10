export function toMs(v: string | Date | number | null | undefined): number | null {
    if (v == null) return null;
    const d = v instanceof Date ? v : new Date(v);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }
  
  export function formatMoney(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }
  
  export function formatCountdown(ms: number): string {
    if (ms <= 0) return '00:00';
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
  
  export function isQuoteExpired(
    expiresAt: string | Date | null | undefined,
    now: number,
  ): boolean {
    const ms = toMs(expiresAt);
    return ms !== null && ms <= now;
  }