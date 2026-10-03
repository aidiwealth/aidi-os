// Money and multiples for fund pages.
export function useMoney() {
  const sym: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
  const money = (v: number | string | null | undefined, c = 'USD', exact = false) => {
    const n = Number(v ?? 0), s = sym[c] ?? c + ' '
    if (exact) return s + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const a = Math.abs(n)
    return s + (a >= 1e9 ? (n / 1e9).toFixed(2) + 'bn' : a >= 1e6 ? (n / 1e6).toFixed(2) + 'm' : a >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString())
  }
  const x = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(2) + 'x')
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (v * 100).toFixed(1) + '%')
  const day = (d: string | null | undefined) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
  return { money, x, pct, day }
}
