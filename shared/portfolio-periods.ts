// Portfolio figures by the period they were reported for. A row is one month (span 1) or a quarter stored on its last
// month (span 3): revenue is the period's total, net burn the average per month, and cash, customers, headcount and
// margin the position at the end. Used by the company page and the server's analysis so both read periods the same way.
export interface PeriodRow { period: string; span: number; values: Record<string, number | null> }
export interface Rolled extends PeriodRow { label: string; monthsIn: number }
export type Granularity = 'quarter' | 'month'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ym = (p: string) => { const y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7)); return { y, m } }
export const monthLabel = (p: string) => { const { y, m } = ym(p); return MON[m - 1] + ' ' + y }
export const quarterLabel = (p: string) => { const { y, m } = ym(p); return 'Q' + Math.ceil(m / 3) + ' ' + y }
export const quarterEnd = (p: string) => { const { y, m } = ym(p); return y + '-' + String(Math.ceil(m / 3) * 3).padStart(2, '0') + '-01' }

// "Jun 2026", "Q2 2026", or "4 months to Jun 2026" for a span that is not a calendar quarter.
export function periodName(period: string, span: number): string {
  if (span <= 1) return monthLabel(period)
  if (span === 3 && ym(period).m % 3 === 0) return quarterLabel(period)
  return span + ' months to ' + monthLabel(period)
}

const has = (r: PeriodRow) => Object.values(r.values).some((v) => v !== null && v !== undefined)

// Quarterly if the company reports in quarters (any multi-month row), otherwise monthly.
export function granularity(rows: PeriodRow[]): Granularity { return rows.some((r) => r.span > 1) ? 'quarter' : 'month' }

// Calendar quarters, oldest first. A reported quarter row is used as is; months inside a quarter are added up (revenue),
// averaged (burn) or taken from the latest month (balances). monthsIn says how many months of figures the quarter holds.
export function byQuarter(rows: PeriodRow[]): Rolled[] {
  const groups = new Map<string, PeriodRow[]>()
  for (const r of rows.filter(has)) { const q = quarterEnd(r.period); (groups.get(q) ?? groups.set(q, []).get(q)!).push(r) }
  const out: Rolled[] = []
  for (const [q, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const whole = list.find((r) => r.span >= 3 && r.period === q)
    const months = list.filter((r) => r.span === 1).sort((a, b) => a.period.localeCompare(b.period))
    const values: Record<string, number | null> = {}
    const keys = new Set(list.flatMap((r) => Object.keys(r.values)))
    for (const k of keys) {
      if (whole && whole.values[k] != null) { values[k] = whole.values[k]!; continue }
      const vs = months.map((r) => r.values[k]).filter((v): v is number => v !== null && v !== undefined)
      if (!vs.length) { values[k] = null; continue }
      values[k] = k === 'revenue' ? vs.reduce((s, v) => s + v, 0) : k === 'net_burn' ? vs.reduce((s, v) => s + v, 0) / vs.length : vs[vs.length - 1]!
    }
    const monthsIn = whole ? 3 : new Set(months.filter((r) => r.values.revenue != null).map((r) => r.period)).size || months.length
    out.push({ period: q, span: 3, values, label: quarterLabel(q), monthsIn })
  }
  return out
}

// Rows as reported (months and quarters as they came in), oldest first.
export function asReported(rows: PeriodRow[]): Rolled[] {
  return rows.filter(has).sort((a, b) => a.period.localeCompare(b.period)).map((r) => ({ ...r, label: periodName(r.period, r.span), monthsIn: r.span }))
}

export function periods(rows: PeriodRow[], g: Granularity = granularity(rows)): Rolled[] { return g === 'quarter' ? byQuarter(rows) : asReported(rows) }

// The last calendar quarter that has ended by `today` (its last month, YYYY-MM-01).
export function lastClosedQuarter(today = new Date()): string {
  const y = today.getUTCFullYear(), m = today.getUTCMonth() + 1
  const q = Math.floor((m - 1) / 3) * 3 // last month of the previous quarter (0 means December last year)
  return q === 0 ? (y - 1) + '-12-01' : y + '-' + String(q).padStart(2, '0') + '-01'
}
