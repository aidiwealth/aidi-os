// Venture & Business Stage Monitor: where a company stands now, from its own figures. Funding stage from the cap
// table, operating stage from revenue, health from profit, runway and the default-alive projection, and two indicative
// readiness scores (equity and debt) with what would move each up. Pure functions, shared by the server and tests.
// Thresholds and weights are settings (platform.settings 'stage_rules'), per region; amounts are in US dollars.

export type Region = 'us' | 'ng' | 'other'
export interface RegionRules { label: string; arr: { seed: number; series_a: number; series_b: number }; raised: { pre_seed: number; seed: number; series_a: number } }
export interface StageRules { regions: Record<Region, RegionRules>; equity: Record<EqKey, number>; debt: Record<DebtKey, number> }
export type EqKey = 'growth' | 'revenue' | 'margin' | 'retention' | 'cap_table' | 'data_room'
export type DebtKey = 'history' | 'consistency' | 'margin' | 'cover' | 'debt' | 'bank'
export const DEFAULT_RULES: StageRules = {
  regions: {
    us: { label: 'United States', arr: { seed: 250000, series_a: 1500000, series_b: 8000000 }, raised: { pre_seed: 1500000, seed: 5000000, series_a: 20000000 } },
    ng: { label: 'Nigeria and Africa', arr: { seed: 100000, series_a: 750000, series_b: 4000000 }, raised: { pre_seed: 500000, seed: 2500000, series_a: 12000000 } },
    other: { label: 'other countries', arr: { seed: 150000, series_a: 1000000, series_b: 5000000 }, raised: { pre_seed: 1000000, seed: 4000000, series_a: 15000000 } } },
  equity: { growth: 25, revenue: 20, margin: 15, retention: 15, cap_table: 15, data_room: 10 },
  debt: { history: 20, consistency: 20, margin: 15, cover: 15, debt: 15, bank: 15 } }
const AFRICA = new Set(['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Egypt', 'Rwanda', 'Uganda', 'Tanzania', 'Senegal', "Côte d'Ivoire", 'Ivory Coast', 'Cameroon', 'Ethiopia', 'Morocco', 'Zambia', 'Zimbabwe', 'Botswana', 'Benin', 'Togo', 'Sierra Leone', 'Liberia', 'Gambia', 'Malawi', 'Mozambique', 'Namibia', 'Tunisia', 'Algeria'])
export const regionOf = (country: string | null | undefined): Region => (!country ? 'other' : /^(united states|usa|us)$/i.test(country.trim()) ? 'us' : AFRICA.has(country.trim()) ? 'ng' : 'other')

export const FUNDING = ['bootstrapped', 'pre_seed', 'seed', 'series_a', 'series_b', 'growth'] as const
export type Funding = (typeof FUNDING)[number]
export const FUNDING_LABEL: Record<Funding, string> = { bootstrapped: 'Bootstrapped', pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', growth: 'Series C and later' }
export const OPERATING_LABEL = { pre_revenue: 'Pre-revenue', early: 'Early revenue', seed: 'Seed-level traction', series_a: 'Series A-level traction', series_b: 'Series B-level and beyond' } as const
export type Operating = keyof typeof OPERATING_LABEL
export const HEALTH = ['profitable', 'default_alive', 'fixable', 'default_dead', 'struggling', 'critical', 'unknown'] as const
export type Health = (typeof HEALTH)[number]
export const HEALTH_LABEL: Record<Health, string> = { profitable: 'Profitable', default_alive: 'Default alive', fixable: 'Default dead, fixable', default_dead: 'Default dead', struggling: 'Struggling', critical: 'Critical', unknown: 'Not enough data' }
export const HEALTH_NOTE: Record<Health, string> = {
  profitable: 'Making a profit over the last three months.', default_alive: 'At today\'s growth and spending, revenue overtakes costs before the cash runs out.',
  fixable: 'Costs stay above revenue before the cash runs out, but there are more than 12 months to change that.', default_dead: 'Costs stay above revenue before the cash runs out, with 6 to 12 months left: raise or cut soon.',
  struggling: 'Under 6 months of cash, or revenue down three months running.', critical: 'Under 3 months of cash.', unknown: 'Add at least three months of statements under Financials.' }

// One month of figures, in the company's currency (expenses = cost of revenue + operating costs).
export interface Mo { month: string; revenue: number | null; expenses: number | null; net: number | null; ebitda: number | null; gross_margin: number | null; cash: number | null; debt: number | null }
export interface CapFacts { has: boolean; raised_usd: number; priced_round: Funding | null; founders_pct: number | null; pool: boolean; safes: number }
export interface Inputs { months: Mo[]; usd: number; runway: number | null; cash: number | null; cash_at: string | null; cap: CapFacts; nrr: number | null; retention_on: boolean; room: { deck: boolean; files: number; links: number }; bank: { connected: boolean; months: number } }

const r1 = (n: number) => Math.round(n * 10) / 10
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
const lin = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo), 0, 1)
const addM = (ym: string, n: number) => { const d = new Date(ym + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7) }
// Compound monthly growth over the last `k` months (first to last), or null.
function cmgr(vals: (number | null)[], k = 3): number | null {
  const v = vals.slice(-(k + 1)); if (v.length < k + 1) return null
  const a = v[0], b = v[v.length - 1]
  if (a === null || b === null || a === undefined || b === undefined || a <= 0 || b <= 0) return null
  return Math.pow(b / a, 1 / k) - 1
}
const avg = (v: (number | null)[]) => { const x = v.filter((n): n is number => typeof n === 'number'); return x.length ? x.reduce((s, n) => s + n, 0) / x.length : null }

export function fundingStage(cap: CapFacts, rr: RegionRules): Funding {
  if (cap.priced_round) return cap.priced_round
  const r = cap.raised_usd
  if (r <= 0) return 'bootstrapped'
  if (r < rr.raised.pre_seed) return 'pre_seed'
  if (r < rr.raised.seed) return 'seed'
  if (r < rr.raised.series_a) return 'series_a'
  return 'series_b'
}
// A priced round's stage from its share class name ("Series A Preferred", "Seed Preferred").
export function classStage(name: string): Funding | null {
  const n = name.toLowerCase()
  const s = /series\s*([a-z])\b/.exec(n)
  if (s) return s[1] === 'a' ? 'series_a' : s[1] === 'b' ? 'series_b' : 'growth'
  if (/pre[\s-]?seed/.test(n)) return 'pre_seed'
  if (/seed/.test(n)) return 'seed'
  return null
}
export function operatingStage(arrUsd: number, rr: RegionRules): Operating {
  if (arrUsd <= 0) return 'pre_revenue'
  if (arrUsd < rr.arr.seed) return 'early'
  if (arrUsd < rr.arr.series_a) return 'seed'
  if (arrUsd < rr.arr.series_b) return 'series_a'
  return 'series_b'
}

export interface Projection { month: string; revenue: number; expenses: number; cash: number }
export interface Alive { series: Projection[]; cross: string | null; zero: string | null; rev_growth: number | null; exp_growth: number | null; shortfall: number | null }
// Revenue and costs carried forward at their trailing three-month growth (held within sensible limits), cash falling
// by the gap. Default alive when revenue overtakes costs before the cash runs out.
export function defaultAlive(i: Inputs, months = 36): Alive | null {
  const m = i.months.filter((x) => x.revenue !== null || x.expenses !== null)
  if (m.length < 3 || i.cash === null) return null
  const last = m.slice(-3), start = m[m.length - 1]!.month
  const gr = cmgr(m.map((x) => x.revenue)), ge = cmgr(m.map((x) => x.expenses))
  const g1 = clamp(gr ?? 0, -0.2, 0.3), g2 = clamp(ge ?? 0, -0.1, 0.15)
  let rev = avg(last.map((x) => x.revenue)) ?? 0, exp = avg(last.map((x) => x.expenses)) ?? 0, cash = i.cash
  const series: Projection[] = []; let cross: string | null = null, zero: string | null = null
  for (let k = 1; k <= months; k++) {
    rev *= 1 + g1; exp *= 1 + g2; cash += rev - exp
    const mo = addM(start, k)
    series.push({ month: mo, revenue: Math.round(rev), expenses: Math.round(exp), cash: Math.round(cash) })
    if (!cross && rev >= exp && !zero) cross = mo
    if (!zero && cash < 0) zero = mo
  }
  const lastP = series[series.length - 1]!
  return { series, cross, zero, rev_growth: r1(g1 * 100), exp_growth: r1(g2 * 100), shortfall: cross ? null : Math.round(lastP.expenses - lastP.revenue) }
}

export function health(i: Inputs, alive: Alive | null): Health {
  const m = i.months.filter((x) => x.revenue !== null || x.net !== null)
  if (m.length < 3) return 'unknown'
  const net3 = avg(m.slice(-3).map((x) => x.net)), rw = i.runway
  // Under three months of cash is critical even when the books show a profit (cash, not profit, keeps the lights on).
  if (rw !== null && rw < 3) return 'critical'
  if (net3 !== null && net3 >= 0 && (m[m.length - 1]!.net ?? 0) >= 0) return 'profitable'
  if (alive?.cross && (!alive.zero || alive.cross < alive.zero)) return 'default_alive'
  const rv = m.slice(-4).map((x) => x.revenue)
  const down3 = rv.length === 4 && rv.every((v) => v !== null) && rv[1]! < rv[0]! && rv[2]! < rv[1]! && rv[3]! < rv[2]!
  if ((rw !== null && rw < 6) || down3) return 'struggling'
  if (rw === null || rw >= 12) return 'fixable'
  return 'default_dead'
}

export interface Part { key: string; label: string; weight: number; score: number; detail: string; fix: string | null; to: string | null }
export interface Score { total: number; likelihood: string; parts: Part[] }
const likely = (s: number) => (s >= 75 ? 'Strong' : s >= 50 ? 'Possible' : s >= 25 ? 'Early' : 'Not yet')
const money = (v: number) => '$' + (v >= 1e6 ? r1(v / 1e6) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : Math.round(v))
const NEXT: Record<Funding, keyof RegionRules['arr']> = { bootstrapped: 'seed', pre_seed: 'seed', seed: 'series_a', series_a: 'series_b', series_b: 'series_b', growth: 'series_b' }
const NEXT_LABEL: Record<keyof RegionRules['arr'], string> = { seed: 'a seed round', series_a: 'a Series A', series_b: 'a Series B' }

export function equityScore(i: Inputs, rr: RegionRules, w: Record<EqKey, number>, fund: Funding): Score {
  const rev = i.months.map((x) => x.revenue), g = cmgr(rev), arr = (rev.filter((v) => v !== null).slice(-1)[0] ?? 0) * 12 * i.usd
  const target = rr.arr[NEXT[fund]], gm = avg(i.months.slice(-3).map((x) => x.gross_margin))
  const cap = i.cap, capScore = !cap.has ? 0 : (cap.founders_pct === null ? 0.25 : lin(cap.founders_pct, 30, 60) * 0.5) + (cap.pool ? 0.25 : 0) + (cap.safes <= 5 ? 0.25 : 0)
  const room = (i.room.deck ? 0.4 : 0) + Math.min(1, i.room.files / 5) * 0.3 + (i.room.links ? 0.3 : 0)
  const parts: Part[] = [
    { key: 'growth', label: 'Revenue growth', weight: w.growth, score: g === null ? 0 : lin(g, 0, 0.15), detail: g === null ? 'Not enough revenue months' : r1(g * 100) + '% a month over the last three months', fix: 'Grow monthly revenue faster: around 15% a month scores in full', to: '/forecast' },
    { key: 'revenue', label: 'Revenue for the next round', weight: w.revenue, score: lin(arr, 0, target), detail: money(arr) + ' annual run rate against about ' + money(target) + ' for ' + NEXT_LABEL[NEXT[fund]], fix: 'Reach about ' + money(target) + ' annual run rate, the usual bar for ' + NEXT_LABEL[NEXT[fund]], to: '/financials' },
    { key: 'margin', label: 'Gross margin', weight: w.margin, score: gm === null ? 0 : lin(gm, 20, 70), detail: gm === null ? 'No gross margin yet' : r1(gm) + '% over the last three months', fix: 'Lift gross margin towards 70%', to: '/financials' },
    { key: 'retention', label: 'Customer retention', weight: w.retention, score: i.nrr === null ? 0 : lin(i.nrr * 100, 80, 110), detail: i.nrr === null ? (i.retention_on ? 'No customer revenue yet' : 'Customer revenue is on the Medium plan') : 'Net revenue retention ' + Math.round(i.nrr * 100) + '% over 12 months', fix: i.nrr === null ? 'Add customer revenue so investors can see retention' : 'Lift net revenue retention above 110%', to: i.retention_on ? '/financials/customers' : '/settings?s=plan' },
    { key: 'cap_table', label: 'Cap table', weight: w.cap_table, score: capScore, detail: !cap.has ? 'No cap table yet' : [cap.founders_pct === null ? 'founders not marked' : 'founders hold ' + r1(cap.founders_pct) + '% fully diluted', cap.pool ? 'option pool in place' : 'no option pool', cap.safes + ' SAFE' + (cap.safes === 1 ? '' : 's') + ' or notes outstanding'].join(' · '), fix: !cap.has ? 'Set up your cap table' : !cap.pool ? 'Set up an option pool' : 'Keep founders above half of the company before a Series A', to: '/cap-table' },
    { key: 'data_room', label: 'Data room', weight: w.data_room, score: room, detail: [i.room.deck ? 'deck in' : 'no deck', i.room.files + ' file' + (i.room.files === 1 ? '' : 's'), i.room.links ? 'shared' : 'not shared yet'].join(' · '), fix: 'Complete your data room: deck, financials and cap table', to: '/fundraising' }]
  return total(parts)
}
export function debtScore(i: Inputs, w: Record<DebtKey, number>): Score {
  const withRev = i.months.filter((x) => x.revenue !== null && x.revenue > 0), last6 = withRev.slice(-6).map((x) => x.revenue!)
  const mean = last6.length ? last6.reduce((s, v) => s + v, 0) / last6.length : 0
  const cv = last6.length > 2 && mean ? Math.sqrt(last6.reduce((s, v) => s + (v - mean) ** 2, 0) / last6.length) / mean : null
  const bigDrop = last6.some((v, k) => k > 0 && v < last6[k - 1]! * 0.8)
  const gm = avg(i.months.slice(-3).map((x) => x.gross_margin)), eb = avg(i.months.slice(-3).map((x) => x.ebitda)), rv = avg(i.months.slice(-3).map((x) => x.revenue))
  const debt = [...i.months].reverse().find((x) => x.debt !== null)?.debt ?? 0, arr = (rv ?? 0) * 12
  const cover = eb === null || !rv ? 0 : eb >= 0 ? 1 : eb >= -0.2 * rv ? 0.5 : 0
  const parts: Part[] = [
    { key: 'history', label: 'Months of revenue', weight: w.history, score: lin(withRev.length, 0, 12), detail: withRev.length + ' month' + (withRev.length === 1 ? '' : 's') + ' with revenue', fix: 'Add more months of statements: lenders look for 12', to: '/financials' },
    { key: 'consistency', label: 'Steady revenue', weight: w.consistency, score: cv === null ? 0 : clamp(1 - cv * 2, 0, 1) * (bigDrop ? 0.5 : 1), detail: cv === null ? 'Not enough months' : (bigDrop ? 'a month fell more than 20% · ' : '') + 'variation ' + Math.round(cv * 100) + '% over six months', fix: 'Keep monthly revenue steady: lenders lend against it', to: '/financials' },
    { key: 'margin', label: 'Gross margin', weight: w.margin, score: gm === null ? 0 : lin(gm, 15, 50), detail: gm === null ? 'No gross margin yet' : r1(gm) + '%', fix: 'Lift gross margin towards 50%', to: '/financials' },
    { key: 'cover', label: 'Ability to repay', weight: w.cover, score: cover, detail: eb === null ? 'No EBITDA yet' : eb >= 0 ? 'EBITDA positive' : 'EBITDA ' + Math.round((eb / (rv || 1)) * 100) + '% of revenue', fix: 'Bring EBITDA to break-even', to: '/forecast' },
    { key: 'debt', label: 'Existing debt', weight: w.debt, score: arr ? clamp(1 - debt / (arr * 0.5), 0, 1) : debt ? 0 : 0.5, detail: debt ? 'Debt of ' + Math.round(debt).toLocaleString('en-US') + ' on the balance sheet' : 'No debt on the balance sheet', fix: 'Lower existing debt against revenue', to: '/financials' },
    { key: 'bank', label: 'Bank history', weight: w.bank, score: i.bank.connected ? 1 : lin(i.bank.months, 0, 6), detail: i.bank.connected ? 'Bank connected' : i.bank.months ? i.bank.months + ' months of statements' : 'No bank connected', fix: 'Connect your bank, or upload six months of statements', to: '/financials' }]
  return total(parts)
}
function total(parts: Part[]): Score {
  const w = parts.reduce((s, p) => s + p.weight, 0) || 1
  const t = Math.round(parts.reduce((s, p) => s + p.weight * p.score, 0) / w * 100)
  return { total: t, likelihood: likely(t), parts: parts.map((p) => ({ ...p, score: Math.round(p.score * 100) / 100 })) }
}
// The changes worth the most points, across both scores.
export function movesUp(e: Score | null, d: Score | null, n = 3) {
  const all = [...(e?.parts ?? []).map((p) => ({ ...p, of: 'Equity' })), ...(d?.parts ?? []).map((p) => ({ ...p, of: 'Debt' }))]
  const wsum = (of: string) => (of === 'Equity' ? e : d)!.parts.reduce((s, p) => s + p.weight, 0) || 1
  return all.map((p) => ({ of: p.of, label: p.label, fix: p.fix, to: p.to, gain: Math.round(p.weight * (1 - p.score) / wsum(p.of) * 100) })).filter((p) => p.gain >= 2 && p.fix).sort((a, b) => b.gain - a.gain).slice(0, n)
}
