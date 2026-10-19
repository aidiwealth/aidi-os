// Customer revenue for Retention and Customers: settings, the customers with their months, and the company's own
// revenue and gross margin from Financials (to reconcile and to value customers).
import type { Cust, GroupBy } from '~/shared/customer-metrics'
import { deriveLines } from '~/shared/fin-view'

export interface CustConfig { currency: string; group_by: GroupBy; enterprise_arr: number; midmarket_arr: number; scheme: { name: string; why: string; segments: { name: string; rule: string }[] } | null }
export async function customerConfig(): Promise<CustConfig> {
  const r = (await db().query<CustConfig>('SELECT currency, group_by, enterprise_arr::float8 AS enterprise_arr, midmarket_arr::float8 AS midmarket_arr, scheme FROM financials.customer_config LIMIT 1')).rows[0]
  if (r) return r
  const org = await currentOrg()
  const cur = String((org?.settings.reporting_currency as string | undefined) || (org?.settings.currency as string | undefined) || 'USD')
  return { currency: /^[A-Z]{3}$/.test(cur) ? cur : 'USD', group_by: 'size', enterprise_arr: 100000, midmarket_arr: 25000, scheme: null }
}
// Customer revenue can be tens of thousands of rows, read by several pages, boards, reports and the analysis, so each
// workspace's copy is kept in memory until the data changes (the stamp: counts, totals and the last edit).
const CACHE = new Map<string, { stamp: string; data: Cust[] }>()
export async function customerStamp(): Promise<string> {
  const r = (await db().query<Record<string, string>>(`SELECT (SELECT count(*) FROM financials.customers) AS c, (SELECT max(updated_at) FROM financials.customers)::text AS u,
    count(*) AS n, coalesce(sum(amount), 0)::text AS s, max(month)::text AS m FROM financials.customer_revenue`)).rows[0]
  return JSON.stringify(r ?? {})
}
export async function loadCustomers(): Promise<Cust[]> {
  const org = currentOrgId(), stamp = await customerStamp()
  const hit = org ? CACHE.get(org) : undefined
  if (hit && hit.stamp === stamp) return hit.data
  const data = await loadCustomersFresh()
  if (org) { CACHE.delete(org); CACHE.set(org, { stamp, data }); if (CACHE.size > 30) CACHE.delete(CACHE.keys().next().value!) }
  return data
}
async function loadCustomersFresh(): Promise<Cust[]> {
  const cs = await db().query<Omit<Cust, 'rev'>>(`SELECT id, name, segment, sector, country, plan, to_char(started_on, 'YYYY-MM-DD') AS started_on, acquisition_cost::float8 AS acquisition_cost, gross_margin_pct::float8 AS gross_margin_pct FROM financials.customers ORDER BY name`)
  const rv = await db().query<{ customer_id: string; m: string; amount: number }>(`SELECT customer_id, to_char(month, 'YYYY-MM') AS m, amount::float8 AS amount FROM financials.customer_revenue`)
  const by = new Map<string, Record<string, number>>()
  for (const r of rv.rows) { const o = by.get(r.customer_id) ?? {}; o[r.m] = r.amount; by.set(r.customer_id, o) }
  return cs.rows.map((c) => ({ ...c, rev: by.get(c.id) ?? {} }))
}
// Monthly revenue and gross margin as entered in Financials (company workspaces), in the customer data's currency.
export async function financialsRevenue(currency: string): Promise<{ revenue: Record<string, number>; gm: number | null }> {
  const ent = await companyEntityId().catch(() => null)
  if (!ent) return { revenue: {}, gm: null }
  const rows = await loadStatements('entity:' + ent, 'month', currency).catch(() => [])
  const revenue: Record<string, number> = {}
  let gp = 0, rv = 0
  for (const r of rows.filter((x) => x.currency === currency)) {
    const d = deriveLines(r.lines, 1)
    if (typeof d.revenue === 'number') revenue[r.period_end.slice(0, 7)] = d.revenue
  }
  for (const r of rows.filter((x) => x.currency === currency).slice(-12)) { const d = deriveLines(r.lines, 1); if (typeof d.revenue === 'number' && typeof d.gross_profit === 'number') { rv += d.revenue; gp += d.gross_profit } }
  return { revenue, gm: rv > 0 ? Math.max(-1, Math.min(1, gp / rv)) : null }
}
