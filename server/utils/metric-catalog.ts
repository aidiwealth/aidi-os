// Every metric a founder can put in front of investors, in one list: the figures from Financials, customer revenue
// retention and customer numbers (from Customers), and the company's own KPIs (customers, volumes, headcount…). Used
// by investor updates (charts and tables), boards and the investor page, so anything on the analysis can be shared.
import { addM, arrOf, retention, type Cust } from '~/shared/customer-metrics'

export type Unit = 'money' | 'pct' | 'months' | 'number'
export interface MetricDef { key: string; label: string; unit: Unit; group: 'Financials' | 'Customers and retention' | 'Your KPIs' }
const FIN_UNIT: Record<string, Unit> = { gross_margin: 'pct', growth: 'pct', runway: 'months' }
export const CUST_METRICS: Record<string, { label: string; unit: Unit }> = {
  'cust:nrr': { label: 'Net revenue retention (12 months)', unit: 'pct' }, 'cust:grr': { label: 'Gross revenue retention (12 months)', unit: 'pct' },
  'cust:logo_churn': { label: 'Customers lost (12 months)', unit: 'pct' }, 'cust:arr': { label: 'Annual recurring revenue', unit: 'money' },
  'cust:mrr': { label: 'Monthly recurring revenue', unit: 'money' }, 'cust:active': { label: 'Paying customers', unit: 'number' },
  'cust:top10': { label: 'Revenue from the top 10 customers', unit: 'pct' } }
export function metricUnit(key: string): Unit {
  if (key.startsWith('kpi:')) return 'number'
  if (key in CUST_METRICS) return CUST_METRICS[key]!.unit
  return FIN_UNIT[key] ?? 'money'
}
export function metricLabel(key: string): string {
  if (key.startsWith('kpi:')) return key.slice(4)
  return CUST_METRICS[key]?.label ?? METRIC_LABEL[key] ?? key
}
export const isMetricKey = (k: string) => k in METRIC_LABEL || k in CUST_METRICS || /^kpi:.{1,60}$/.test(k)

// Customer data is the company's (not per entity), so it is offered for the company itself.
async function customersOn(subject?: string | null): Promise<boolean> {
  const org = await currentOrg()
  if (org?.kind !== 'company' || !(await enabledModules()).has('fin_customers')) return false
  if (subject && subject !== 'entity:' + (await companyEntityId())) return false
  return Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM financials.customers').catch(() => ({ rows: [{ n: '0' }] }))).rows[0]?.n ?? 0) > 0
}
export async function metricCatalog(subject?: string | null): Promise<MetricDef[]> {
  const out: MetricDef[] = Object.entries(METRIC_LABEL).map(([key, label]) => ({ key, label, unit: metricUnit(key), group: 'Financials' as const }))
  if (await customersOn(subject)) for (const [key, m] of Object.entries(CUST_METRICS)) out.push({ key, label: m.label, unit: m.unit, group: 'Customers and retention' })
  const subj = subject ?? (await companyEntityId().then((e) => (e ? 'entity:' + e : null)).catch(() => null))
  if (subj && /^(entity|company):/.test(subj)) {
    const rows = await loadStatements(subj, 'month', ((await currentOrg())?.settings.currency as string) || 'USD').catch(() => [])
    const names = new Set<string>(); for (const r of rows.slice(-24)) for (const k of Object.keys(r.kpis ?? {})) names.add(k)
    for (const k of [...names].sort()) out.push({ key: 'kpi:' + k, label: k, unit: 'number', group: 'Your KPIs' })
  }
  return out
}

// Values of the customer metrics at the end of each given month (YYYY-MM).
export async function customerSeries(keys: string[], months: string[]): Promise<Record<string, (number | null)[]>> {
  const want = keys.filter((k) => k in CUST_METRICS)
  if (!want.length || !(await customersOn())) return Object.fromEntries(want.map((k) => [k, months.map(() => null)]))
  const cs: Cust[] = await loadCustomers()
  const out: Record<string, (number | null)[]> = {}
  for (const k of want) out[k] = months.map((m) => {
    if (!cs.some((c) => Object.keys(c.rev).some((x) => x <= m))) return null
    if (k === 'cust:nrr' || k === 'cust:grr' || k === 'cust:logo_churn') { const r = retention(cs, m, 12); const v = k === 'cust:nrr' ? r.nrr : k === 'cust:grr' ? r.grr : r.logo_churn; return v == null ? null : Math.round(v * 1000) / 10 }
    const arrs = cs.map((c) => arrOf(c, m))
    if (k === 'cust:arr') return Math.round(arrs.reduce((a, b) => a + b, 0))
    if (k === 'cust:mrr') return Math.round(arrs.reduce((a, b) => a + b, 0) / 12)
    if (k === 'cust:active') return cs.filter((c) => (c.rev[m] ?? 0) > 0).length
    // Share of the last 12 months' revenue from the ten largest customers.
    const ttm = cs.map((c) => { let s = 0; for (let i = 0; i < 12; i++) s += c.rev[addM(m, -i)] ?? 0; return s }).sort((a, b) => b - a)
    const tot = ttm.reduce((a, b) => a + b, 0)
    return tot ? Math.round((ttm.slice(0, 10).reduce((a, b) => a + b, 0) / tot) * 1000) / 10 : null
  })
  return out
}

// Revenue by customer sector over the last 12 months (shares only, no customer names), for the investor page and updates.
export async function sectorShares(): Promise<{ as_of: string; sectors: { sector: string; share: number; customers: number }[] } | null> {
  if (!(await customersOn())) return null
  const cs = await loadCustomers()
  const last = cs.flatMap((c) => Object.keys(c.rev)).sort().pop(); if (!last) return null
  const by = new Map<string, { rev: number; n: number }>()
  for (const c of cs) { let s = 0; for (let i = 0; i < 12; i++) s += c.rev[addM(last, -i)] ?? 0; if (s <= 0) continue; const k = c.sector?.trim() || 'Not set'; const g = by.get(k) ?? { rev: 0, n: 0 }; g.rev += s; g.n++; by.set(k, g) }
  const tot = [...by.values()].reduce((a, b) => a + b.rev, 0); if (!tot) return null
  const rows = [...by.entries()].map(([sector, g]) => ({ sector, share: Math.round((g.rev / tot) * 1000) / 10, customers: g.n })).sort((a, b) => b.share - a.share)
  const top = rows.slice(0, 7), rest = rows.slice(7)
  if (rest.length) top.push({ sector: 'Other sectors', share: Math.round(rest.reduce((a, b) => a + b.share, 0) * 10) / 10, customers: rest.reduce((a, b) => a + b.customers, 0) })
  return { as_of: last, sectors: top }
}
