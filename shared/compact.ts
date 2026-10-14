// Short amounts for metric tiles: 1250000 → 1.3M, 500000 → 500k. Below 10,000 stays as it is.
export function compactNum(n: number): string | null {
  const a = Math.abs(n)
  if (!Number.isFinite(n) || a < 10_000) return null
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']]
  let i = units.findIndex(([d]) => a >= d)
  const fmt = (v: number) => (v >= 100 ? Math.round(v).toString() : v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/\.?0+$/, ''))
  let out = fmt(a / units[i]![0])
  if (Number(out) >= 1000 && i > 0) { i--; out = fmt(a / units[i]![0]) }
  return out + units[i]![1]
}
// Shorten every amount inside a display string ("$1,250,000.00 · ₦3,400,000" → "$1.3M · ₦3.4M"); leaves other text alone.
export function compactText(s: string): string {
  return s.replace(/\d[\d,]*(?:\.\d+)?/g, (m) => compactNum(Number(m.replace(/,/g, ''))) ?? m)
}
