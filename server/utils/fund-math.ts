// Fund arithmetic: pro rata allocation to the cent, XIRR, and the standard multiples.
export function allocate(total: number, weights: { id: string; w: number }[]): Map<string, number> {
  const cents = Math.round(total * 100), sum = weights.reduce((s, x) => s + x.w, 0)
  const out = new Map<string, number>()
  if (!sum) return out
  const raw = weights.map((x) => ({ id: x.id, exact: (cents * x.w) / sum }))
  let used = 0
  for (const r of raw) { const c = Math.floor(r.exact); out.set(r.id, c); used += c }
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1)).slice(0, cents - used)) out.set(r.id, out.get(r.id)! + 1)
  for (const [k, v] of out) out.set(k, v / 100)
  return out
}
// Annualised IRR of dated cash flows (negative = money in, positive = money out); null if it cannot be computed.
export function xirr(flows: { date: string; amount: number }[]): number | null {
  const f = flows.filter((x) => x.amount !== 0).sort((a, b) => a.date.localeCompare(b.date))
  if (f.length < 2 || !f.some((x) => x.amount < 0) || !f.some((x) => x.amount > 0)) return null
  const t0 = Date.parse(f[0]!.date), yrs = f.map((x) => (Date.parse(x.date) - t0) / (365 * 86400000))
  if (yrs[yrs.length - 1]! < 30 / 365) return null
  const npv = (r: number) => f.reduce((s, x, i) => s + x.amount / Math.pow(1 + r, yrs[i]!), 0)
  let lo = -0.9999, hi = 10
  if (npv(lo) * npv(hi) > 0) return null
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid }
  return (lo + hi) / 2
}
export interface Multiples { paidIn: number; distributed: number; nav: number; dpi: number | null; rvpi: number | null; tvpi: number | null; irr: number | null }
export function multiples(paidIn: number, distributed: number, nav: number, flows: { date: string; amount: number }[], navDate: string | null): Multiples {
  const all = [...flows]
  if (nav > 0 && navDate) all.push({ date: navDate, amount: nav })
  return { paidIn, distributed, nav, dpi: paidIn ? distributed / paidIn : null, rvpi: paidIn ? nav / paidIn : null, tvpi: paidIn ? (distributed + nav) / paidIn : null, irr: xirr(all) }
}
