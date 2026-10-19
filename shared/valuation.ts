// Valuation from trading peers (multiples): what listed companies like this one trade at, and what similar private
// rounds and acquisitions were priced at, applied to the company's own figures from Financials. Worked out the same way
// on the page and on the server, so what the founder edits is what they see.
//   EV / revenue      the peers' enterprise value over their last-12-month revenue, times the company's revenue
//   EV / gross profit the same over gross profit: fairer when gross margins differ (a company that passes carrier or
//                     card fees through cost of revenue is not penalised for it, nor flattered)
//   EV / EBITDA       only when the company's EBITDA is positive
//   Transactions      private rounds and acquisitions of similar companies (EV / revenue at the time)
// Each gives a low (25th percentile), mid (median) and high (75th percentile) multiple. A private company is usually
// worth less than a listed one (no market to sell the shares on) and a riskier market less again: both discounts are
// the founder's to set (the AI suggests them, with reasons). Equity value = enterprise value + cash − debt.

export type PeerKind = 'public' | 'private' | 'acquisition'
export interface Peer {
  name: string; ticker: string; kind: PeerKind; country: string; what: string; why: string
  ev_revenue: number | null; ev_ebitda: number | null; growth_pct: number | null; gross_margin_pct: number | null; ebitda_margin_pct: number | null
  ev_usd: number | null; as_of: string; source: string; use: boolean; added: 'ai' | 'founder'
}
export interface ValAssumptions {
  basis: 'revenue_ttm' | 'run_rate' | 'arr'; private_discount: number; market_discount: number; about: string; focus: string
  ai?: { private_discount: number; market_discount: number; rationale: string; summary: string } | null
}
export const VAL_DEFAULT: ValAssumptions = { basis: 'revenue_ttm', private_discount: 25, market_discount: 0, about: '', focus: '', ai: null }
export interface ValCompany {
  currency: string; latest: string | null; revenue_ttm: number | null; ttm_source: string; run_rate: number | null; arr: number | null; gross_profit_ttm: number | null
  gross_margin_pct: number | null; ebitda_ttm: number | null; ebitda_margin_pct: number | null; growth_pct: number | null; growth_source: string
  cash: number | null; debt: number | null; business_type: string; note: string
}
export interface Method { key: string; label: string; metric: string; base: number; peers: number; low: number; mid: number; high: number; ev: [number, number, number] }
export interface Valuation {
  basis_value: number; basis_label: string; methods: Method[]; discount: number
  ev: [number, number, number] | null; equity: [number, number, number] | null; net_cash: number
  compare: { label: string; company: number | null; peers: number | null; unit: '%' | '×' }[]; warnings: string[]
}

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); if (!s.length) return 0; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo]! + (s[hi]! - s[lo]!) * (i - lo) }
const ok = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)
const r1 = (v: number) => Math.round(v * 10) / 10

export function valuate(c: ValCompany, peers: Peer[], a: ValAssumptions): Valuation {
  const used = peers.filter((p) => p.use)
  const pub = used.filter((p) => p.kind === 'public'), deals = used.filter((p) => p.kind !== 'public')
  const basisValue = a.basis === 'arr' ? c.arr ?? 0 : a.basis === 'run_rate' ? c.run_rate ?? 0 : c.revenue_ttm ?? 0
  const basisLabel = a.basis === 'arr' ? 'ARR' : a.basis === 'run_rate' ? 'Revenue run rate (latest month × 12)' : 'Revenue, last 12 months'
  const discount = 1 - (1 - Math.min(90, Math.max(0, a.private_discount)) / 100) * (1 - Math.min(90, Math.max(0, a.market_discount)) / 100)
  const methods: Method[] = []
  const add = (key: string, label: string, metric: string, base: number | null, xs: number[]) => {
    const v = xs.filter((x) => ok(x) && x > 0 && x < 500)
    if (!ok(base) || base <= 0 || v.length < 2) return
    const low = q(v, 0.25), mid = q(v, 0.5), high = q(v, 0.75), k = 1 - discount
    methods.push({ key, label, metric, base, peers: v.length, low: r1(low), mid: r1(mid), high: r1(high), ev: [base * low * k, base * mid * k, base * high * k] })
  }
  add('ev_revenue', 'Trading peers · EV / revenue', basisLabel, basisValue, pub.map((p) => p.ev_revenue!))
  // Over gross profit: each peer's revenue multiple divided by its gross margin.
  const gpBase = c.gross_margin_pct != null && basisValue ? basisValue * c.gross_margin_pct / 100 : c.gross_profit_ttm
  add('ev_gp', 'Trading peers · EV / gross profit', 'Gross profit (' + (c.gross_margin_pct != null ? r1(c.gross_margin_pct) + '% of ' + basisLabel.toLowerCase() : 'last 12 months') + ')', gpBase,
    pub.filter((p) => ok(p.ev_revenue) && ok(p.gross_margin_pct) && p.gross_margin_pct! > 3).map((p) => p.ev_revenue! / (p.gross_margin_pct! / 100)))
  if (ok(c.ebitda_ttm) && c.ebitda_ttm > 0) add('ev_ebitda', 'Trading peers · EV / EBITDA', 'EBITDA, last 12 months', c.ebitda_ttm, pub.map((p) => p.ev_ebitda!))
  add('deals', 'Private rounds and acquisitions · EV / revenue', basisLabel, basisValue, deals.map((p) => p.ev_revenue!))
  const netCash = (c.cash ?? 0) - (c.debt ?? 0)
  const ev = methods.length ? ([0, 1, 2].map((i) => methods.reduce((s, m) => s + m.ev[i]!, 0) / methods.length) as [number, number, number]) : null
  const med = (f: (p: Peer) => number | null) => { const v = pub.map(f).filter(ok); return v.length ? r1(q(v, 0.5)) : null }
  const compare = [
    { label: 'Revenue growth', company: c.growth_pct, peers: med((p) => p.growth_pct), unit: '%' as const },
    { label: 'Gross margin', company: c.gross_margin_pct, peers: med((p) => p.gross_margin_pct), unit: '%' as const },
    { label: 'EBITDA margin', company: c.ebitda_margin_pct, peers: med((p) => p.ebitda_margin_pct), unit: '%' as const },
    { label: 'EV / revenue', company: null, peers: med((p) => p.ev_revenue), unit: '×' as const }]
  const warnings: string[] = []
  if (!basisValue) warnings.push('No ' + basisLabel.toLowerCase() + ' in Financials yet: add your figures first.')
  if (pub.length < 3) warnings.push('Fewer than three listed peers are ticked: the range is thin. Find more with AI or add peers you know.')
  if (c.growth_pct != null && compare[0]!.peers != null && c.growth_pct < compare[0]!.peers - 10) warnings.push('Growth is well below the peers\'; investors will lean to the low end of the range.')
  if (c.growth_pct != null && compare[0]!.peers != null && c.growth_pct > compare[0]!.peers + 20) warnings.push('Growth is well above the peers\'; the high end is defensible if it holds.')
  return { basis_value: basisValue, basis_label: basisLabel, methods, discount: Math.round(discount * 1000) / 10, ev, equity: ev ? (ev.map((v) => v + netCash) as [number, number, number]) : null, net_cash: netCash, compare, warnings }
}

const t = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const num = (v: unknown, lo: number, hi: number) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null }
export function cleanPeer(p: any, added: 'ai' | 'founder' = 'ai'): Peer {
  const src = t(p?.source, 300)
  return { name: t(p?.name, 120), ticker: t(p?.ticker, 24), kind: p?.kind === 'private' || p?.kind === 'acquisition' ? p.kind : 'public', country: t(p?.country, 60), what: t(p?.what, 300), why: t(p?.why, 400),
    ev_revenue: num(p?.ev_revenue, 0, 500), ev_ebitda: num(p?.ev_ebitda, -500, 2000), growth_pct: num(p?.growth_pct, -100, 1000), gross_margin_pct: num(p?.gross_margin_pct, -100, 100), ebitda_margin_pct: num(p?.ebitda_margin_pct, -500, 100),
    ev_usd: num(p?.ev_usd, 0, 1e13), as_of: t(p?.as_of, 20), source: /^https?:\/\/[^\s"'<>]+$/i.test(src) ? src : '', use: p?.use !== false, added: p?.added === 'founder' ? 'founder' : added }
}
