// Customer revenue maths, shared by the Retention and Customers pages (and the AI write-up on the server).
// Revenue is by customer by calendar month ('YYYY-MM'). Retention compares the same customers across a window:
//   NRR = their revenue now / their revenue a year ago (expansion included, new customers excluded)
//   GRR = the same, but each customer capped at what they paid before (so only losses count)
//   Logo churn = share of last year's paying customers who pay nothing now.

export interface Cust { id: string; name: string; segment: string | null; sector: string | null; country: string | null; plan: string | null; started_on: string | null; acquisition_cost: number | null; gross_margin_pct: number | null; rev: Record<string, number> }
export type GroupBy = 'size' | 'segment' | 'sector' | 'plan' | 'country'
export type Basis = 'month' | 'quarter' | 'year'
export interface Thresholds { enterprise: number; midmarket: number }

export const addM = (m: string, k: number): string => { const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) - 1 + k; const d = new Date(Date.UTC(y, mo, 1)); return d.toISOString().slice(0, 7) }
export const monthsBetween = (a: string, b: string): string[] => { const out: string[] = []; for (let m = a; m <= b && out.length < 600; m = addM(m, 1)) out.push(m); return out }
export function span(cs: Cust[]): { first: string; last: string } | null {
  let first = '', last = ''
  for (const c of cs) for (const [m, v] of Object.entries(c.rev)) if (v) { if (!first || m < first) first = m; if (!last || m > last) last = m }
  return first ? { first, last } : null
}
const W: Record<Basis, number> = { month: 1, quarter: 3, year: 12 }
// A customer's revenue over the window of `w` months ending at `m`.
export const win = (c: Cust, m: string, w: number): number => { let s = 0; for (let i = 0; i < w; i++) s += c.rev[addM(m, -i)] ?? 0; return s }
const firstMonth = (c: Cust) => Object.keys(c.rev).filter((m) => (c.rev[m] ?? 0) > 0).sort()[0] ?? null
const lastMonth = (c: Cust) => Object.keys(c.rev).filter((m) => (c.rev[m] ?? 0) > 0).sort().pop() ?? null
// Annual run-rate: the last three months averaged, times twelve (smooths lumpy billing).
export const arrOf = (c: Cust, asOf: string): number => (win(c, asOf, 3) / 3) * 12
export function sizeOf(arr: number, t: Thresholds): string { return arr >= t.enterprise ? 'Enterprise' : arr >= t.midmarket ? 'Mid-market' : 'SMB' }
// The group a customer falls in. Size uses the customer's run-rate at the start of the window, so a customer who
// shrank is judged by what they were.
export function groupOf(c: Cust, by: GroupBy, at: string, t: Thresholds): string {
  if (by === 'size') {
    let a = arrOf(c, at)
    if (!a) { const l = lastMonth(c), f = firstMonth(c); a = l && l < at ? arrOf(c, l) : f && f > at ? arrOf(c, addM(f, 2)) : 0 }
    return sizeOf(a, t)
  }
  const v = by === 'segment' ? c.segment : by === 'sector' ? c.sector : by === 'plan' ? c.plan : c.country
  return (v ?? '').trim() || 'Not set'
}

export interface Ret { customers: number; kept: number; base: number; now: number; nrr: number | null; grr: number | null; logo_churn: number | null; expansion: number; contraction: number; churned: number }
// Retention of the customers who paid in the window ending `from`, measured in the window ending `to`.
export function retention(cs: Cust[], to: string, months = 12, basis: Basis = 'month'): Ret {
  const w = W[basis], from = addM(to, -months)
  let customers = 0, kept = 0, base = 0, now = 0, capped = 0, expansion = 0, contraction = 0, churned = 0
  for (const c of cs) {
    const a = win(c, from, w); if (a <= 0) continue
    const b = Math.max(0, win(c, to, w))
    customers++; base += a; now += b; capped += Math.min(a, b)
    if (b > 0) kept++
    if (b === 0) churned += a; else if (b > a) expansion += b - a; else contraction += a - b
  }
  return { customers, kept, base, now, nrr: base ? now / base : null, grr: base ? capped / base : null, logo_churn: customers ? 1 - kept / customers : null, expansion, contraction, churned }
}

export interface BridgeRow { month: string; start: number; new: number; expansion: number; contraction: number; churned: number; reactivated: number; end: number; active: number; new_logos: number; lost_logos: number }
// Month by month: where revenue came from and went.
export function bridge(cs: Cust[], months: string[]): BridgeRow[] {
  const first = new Map(cs.map((c) => [c.id, firstMonth(c)]))
  return months.map((m) => {
    const p = addM(m, -1)
    const r: BridgeRow = { month: m, start: 0, new: 0, expansion: 0, contraction: 0, churned: 0, reactivated: 0, end: 0, active: 0, new_logos: 0, lost_logos: 0 }
    for (const c of cs) {
      const a = c.rev[p] ?? 0, b = c.rev[m] ?? 0
      r.start += a; r.end += b; if (b > 0) r.active++
      if (a <= 0 && b > 0) { if (first.get(c.id) === m) { r.new += b; r.new_logos++ } else r.reactivated += b }
      else if (a > 0 && b <= 0) { r.churned += a; r.lost_logos++ }
      else if (b > a) r.expansion += b - a
      else if (a > b) r.contraction += a - b
    }
    return r
  })
}

// Cohorts by the quarter a customer first paid: revenue at months 0, 3, 6, 12, 18, 24 as a share of month 0
// (three-month windows, so a lumpy month does not distort it).
export const COHORT_AT = [0, 3, 6, 12, 18, 24]
export function cohorts(cs: Cust[], last: string): { cohort: string; size: number; base: number; cells: (number | null)[] }[] {
  const by = new Map<string, Cust[]>()
  for (const c of cs) { const f = firstMonth(c); if (!f) continue; const q = f.slice(0, 4) + ' Q' + Math.ceil(Number(f.slice(5, 7)) / 3); by.set(q, [...(by.get(q) ?? []), c]) }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cohort, list]) => {
    const start = (c: Cust) => firstMonth(c)!
    const at = (k: number) => list.reduce((s, c) => s + [0, 1, 2].reduce((x, i) => x + (c.rev[addM(start(c), k + i)] ?? 0), 0), 0)
    const base = at(0)
    const cells = COHORT_AT.map((k) => { const lastNeeded = list.reduce((mx, c) => { const e = addM(start(c), k + 2); return e > mx ? e : mx }, ''); return lastNeeded > last || !base ? null : at(k) / base })
    return { cohort, size: list.length, base, cells }
  })
}

export interface CustStat { id: string; name: string; group: string; sector: string; segment: string; country: string; plan: string; first: string | null; last: string | null; active: boolean; mrr: number; arr: number; ttm: number; prior_ttm: number; growth: number | null; lifetime: number; tenure: number; ltv: number | null; cac: number | null; ltv_cac: number | null; payback: number | null; share: number }
export interface Summary { as_of: string; currency: string; active: number; mrr: number; arr: number; ttm: number; arpa: number | null; monthly_churn: number | null; monthly_rev_churn: number | null; lifetime_months: number | null; gm: number | null; ltv: number | null; cac: number | null; ltv_cac: number | null; payback: number | null; top1: number | null; top5: number | null; top10: number | null; pareto: number | null; hhi: number | null }

// Per customer and overall: run-rate, last 12 months, growth, lifetime value and acquisition payback.
// LTV = average monthly revenue per customer × gross margin ÷ monthly revenue churn (capped at five years).
export function customerStats(cs: Cust[], asOf: string, t: Thresholds, by: GroupBy, gmDefault: number | null, currency: string): { rows: CustStat[]; summary: Summary } {
  const r12 = retention(cs, asOf, 12, 'month')
  const monthlyChurn = r12.logo_churn === null ? null : 1 - Math.pow(Math.max(0, 1 - r12.logo_churn), 1 / 12)
  const monthlyRevChurn = r12.grr === null ? null : 1 - Math.pow(Math.max(0, r12.grr), 1 / 12)
  const life = monthlyRevChurn && monthlyRevChurn > 0 ? Math.min(60, 1 / monthlyRevChurn) : r12.grr !== null ? 60 : null
  let ttmAll = 0
  const rows: CustStat[] = cs.map((c) => {
    const ttm = win(c, asOf, 12), prior = win(c, addM(asOf, -12), 12), mrr = win(c, asOf, 3) / 3
    ttmAll += Math.max(0, ttm)
    const f = firstMonth(c), l = lastMonth(c)
    const tenure = f ? monthsBetween(f, l && l < asOf ? l : asOf).length : 0
    const gm = c.gross_margin_pct != null ? c.gross_margin_pct / 100 : gmDefault
    const ltv = mrr > 0 && life ? mrr * (gm ?? 1) * life : null
    const cac = c.acquisition_cost
    const payback = cac && mrr > 0 ? cac / (mrr * (gm ?? 1)) : null
    return { id: c.id, name: c.name, group: groupOf(c, by, asOf, t), sector: c.sector ?? '', segment: c.segment ?? '', country: c.country ?? '', plan: c.plan ?? '', first: f, last: l, active: (c.rev[asOf] ?? 0) > 0 || win(c, asOf, 3) > 0, mrr, arr: mrr * 12, ttm, prior_ttm: prior, growth: prior > 0 ? ttm / prior - 1 : null,
      lifetime: Object.entries(c.rev).filter(([m]) => m <= asOf).reduce((s, [, v]) => s + v, 0), tenure, ltv, cac, ltv_cac: ltv && cac ? ltv / cac : null, payback, share: 0 }
  })
  for (const r of rows) r.share = ttmAll ? Math.max(0, r.ttm) / ttmAll : 0
  const active = rows.filter((r) => r.active)
  const sorted = [...rows].sort((a, b) => b.ttm - a.ttm)
  const topShare = (n: number) => (ttmAll ? sorted.slice(0, n).reduce((s, r) => s + Math.max(0, r.ttm), 0) / ttmAll : null)
  let acc = 0, pareto: number | null = null
  for (let i = 0; i < sorted.length && ttmAll; i++) { acc += Math.max(0, sorted[i]!.ttm); if (acc >= 0.8 * ttmAll) { pareto = (i + 1) / Math.max(1, sorted.filter((r) => r.ttm > 0).length); break } }
  const mrr = active.reduce((s, r) => s + r.mrr, 0)
  const arpa = active.length ? mrr / active.length : null
  const gmW = (() => { const w = active.filter((r) => r.mrr > 0); const withGm = cs.filter((c) => c.gross_margin_pct != null).length; return withGm ? w.reduce((s, r) => s + r.mrr * ((cs.find((c) => c.id === r.id)!.gross_margin_pct ?? (gmDefault ?? 1) * 100) / 100), 0) / Math.max(1, mrr) : gmDefault })()
  const withCac = active.filter((r) => r.cac)
  const cac = withCac.length ? withCac.reduce((s, r) => s + r.cac!, 0) / withCac.length : null
  const ltv = arpa && life ? arpa * (gmW ?? 1) * life : null
  return { rows, summary: { as_of: asOf, currency, active: active.length, mrr, arr: mrr * 12, ttm: ttmAll, arpa, monthly_churn: monthlyChurn, monthly_rev_churn: monthlyRevChurn, lifetime_months: life, gm: gmW, ltv, cac, ltv_cac: ltv && cac ? ltv / cac : null, payback: cac && arpa ? cac / (arpa * (gmW ?? 1)) : null,
    top1: topShare(1), top5: topShare(5), top10: topShare(10), pareto, hhi: ttmAll ? rows.reduce((s, r) => s + Math.pow(r.share * 100, 2), 0) : null } }
}

// Retention and value by group (size, segment, sector, plan or country).
export interface GroupRow { group: string; customers: number; active: number; ttm: number; share: number; arpa: number | null; nrr: number | null; grr: number | null; logo_churn: number | null; growth: number | null; ltv: number | null }
export function byGroup(cs: Cust[], stats: CustStat[], asOf: string, by: GroupBy, t: Thresholds, basis: Basis = 'month'): GroupRow[] {
  const at = addM(asOf, -12)
  const groups = new Map<string, Cust[]>()
  // For retention, the group is judged at the start of the window (what the customer was a year ago).
  for (const c of cs) { const g = groupOf(c, by, by === 'size' ? at : asOf, t); groups.set(g, [...(groups.get(g) ?? []), c]) }
  const total = stats.reduce((s, r) => s + Math.max(0, r.ttm), 0)
  const order = by === 'size' ? ['Enterprise', 'Mid-market', 'SMB'] : []
  return [...groups.entries()].map(([group, list]) => {
    const ids = new Set(list.map((c) => c.id)), st = stats.filter((r) => ids.has(r.id))
    const r = retention(list, asOf, 12, basis)
    const ttm = st.reduce((s, x) => s + x.ttm, 0), prior = st.reduce((s, x) => s + x.prior_ttm, 0)
    const act = st.filter((x) => x.active), mrr = act.reduce((s, x) => s + x.mrr, 0)
    const ltvs = act.map((x) => x.ltv).filter((x): x is number => x !== null)
    return { group, customers: list.length, active: act.length, ttm, share: total ? ttm / total : 0, arpa: act.length ? mrr / act.length : null, nrr: r.nrr, grr: r.grr, logo_churn: r.logo_churn, growth: prior > 0 ? ttm / prior - 1 : null, ltv: ltvs.length ? ltvs.reduce((a, b) => a + b, 0) / ltvs.length : null }
  }).sort((a, b) => (order.length ? order.indexOf(a.group) - order.indexOf(b.group) : 0) || (a.group === 'Not set' ? 1 : b.group === 'Not set' ? -1 : b.ttm - a.ttm))
}

// NRR and GRR month by month (each against the same month a year earlier).
export function retentionTrend(cs: Cust[], months: string[], basis: Basis = 'month'): { month: string; nrr: number | null; grr: number | null; logo_churn: number | null }[] {
  return months.map((m) => { const r = retention(cs, m, 12, basis); return { month: m, nrr: r.nrr, grr: r.grr, logo_churn: r.logo_churn } })
}

// Normalised customer name, for matching the same customer across uploads.
export function custKey(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|inc|incorporated|ltd|limited|llc|plc|corp|corporation|co|company|gmbh|sa|bv|pty|nv|ag|srl|limited liability company)\b/g, ' ').replace(/\s+/g, ' ').trim() || name.toLowerCase().trim()
}
