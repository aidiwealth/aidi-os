// Short amounts for metric boxes and charts: $505,000 → $505k, ₦101,000,000 → ₦101M. Exact figures stay in tables.
import { compactNum, compactText } from '~/shared/compact'
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€', CAD: 'C$', ZAR: 'R', KES: 'KSh ', GHS: 'GH₵' }
// Shorten every amount inside an already formatted string.
export const brief = (s: string | number | null | undefined) => (s == null ? '' : compactText(String(s)))
// An amount in a currency, short once it reaches 10,000.
export function briefMoney(v: number | string | null | undefined, c = 'USD'): string {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return '—'
  const k = compactNum(n)
  return (n < 0 ? '−' : '') + (SYM[c] ?? c + ' ') + (k ?? Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 }))
}
