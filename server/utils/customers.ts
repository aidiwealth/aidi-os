// Customer revenue for Retention and Customers: settings, the customers with their months, and the company's own
// revenue and gross margin from Financials (to reconcile and to value customers).
import type { Cust, GroupBy } from '~/shared/customer-metrics'
import { deriveLines } from '~/shared/fin-view'
import { rateBook } from './fx-book'
import { custEntities, custEntityId } from './cust-scope'

// billing: how customers pay. Usage (pay as you go) and prepaid credits (customers buy credit and use it over months,
// like SMS units) make revenue lumpy: dormant_months is how long without revenue before a customer counts as lost, and
// retention_basis evens out seasons (quarter or year windows).
export type Billing = 'subscription' | 'usage' | 'prepaid'
export interface CustConfig { currency: string; group_by: GroupBy; enterprise_arr: number; midmarket_arr: number; scheme: { name: string; why: string; segments: { name: string; rule: string }[] } | null; billing: Billing; dormant_months: number; retention_basis: 'month' | 'quarter' | 'year' }
// Settings for the company this request works on. For the group (every company combined): the main company's settings,
// in the group's currency (the reporting currency, else the main company's).
type CfgRow = CustConfig & { entity_id: string | null }
const CFG_COLS = 'entity_id, currency, group_by, enterprise_arr::float8 AS enterprise_arr, midmarket_arr::float8 AS midmarket_arr, scheme, billing, dormant_months, retention_basis'
async function configRows(): Promise<CfgRow[]> { return (await db().query<CfgRow>('SELECT ' + CFG_COLS + ' FROM financials.customer_config')).rows }
async function defaultConfig(): Promise<CustConfig> {
  const org = await currentOrg()
  const cur = String((org?.settings.reporting_currency as string | undefined) || (org?.settings.currency as string | undefined) || 'USD')
  return { currency: /^[A-Z]{3}$/.test(cur) ? cur : 'USD', group_by: 'size', enterprise_arr: 100000, midmarket_arr: 25000, scheme: null, billing: 'subscription', dormant_months: 1, retention_basis: 'month' }
}
const strip = (r: CfgRow): CustConfig => { const { entity_id: _e, ...c } = r; return c }
export async function groupCurrency(): Promise<string> {
  const org = await currentOrg()
  const rep = org?.settings.reporting_currency as string | undefined
  if (rep && /^[A-Z]{3}$/.test(rep)) return rep
  const ents = await custEntities(), rows = await configRows()
  return rows.find((r) => r.entity_id === ents[0]?.id)?.currency ?? (await defaultConfig()).currency
}
export async function customerConfig(): Promise<CustConfig> {
  const rows = await configRows()
  const one = custEntityId()
  if (one) {
    // A company's customer figures are in its own currency (a Nigerian subsidiary in naira). Figures saved in another
    // currency (e.g. converted to US dollars before the group had its companies, then moved here) are converted once.
    const e = (await custEntities()).find((x) => x.id === one), r = rows.find((x) => x.entity_id === one)
    if (r && e?.currency && r.currency !== e.currency) { await alignCurrency(one, r.currency, e.currency); r.currency = e.currency }
    if (r) return strip(r)
    const d = await defaultConfig(); return { ...d, currency: e?.currency ?? d.currency }
  }
  const ents = await custEntities()
  const withData = await entitiesWithCustomers()
  if (withData.length <= 1) { const r = rows.find((x) => x.entity_id === (withData[0] ?? ents[0]?.id)) ?? rows[0]; return r ? strip(r) : await defaultConfig() }
  const main = rows.find((x) => x.entity_id === ents[0]?.id) ?? rows[0]
  return { ...(main ? strip(main) : await defaultConfig()), currency: await groupCurrency() }
}
// Convert one company's saved customer revenue (and acquisition costs) from one currency to another, month by month at
// the book rates (fx-book.ts). Only the request that flips the settings' currency does it, so it runs once.
async function alignCurrency(entityId: string, from: string, to: string): Promise<void> {
  const book = await rateBook()
  const c = await db().connect()
  try {
    await c.query('BEGIN')
    const flipped = (await c.query('UPDATE financials.customer_config SET currency = $3, updated_at = now() WHERE entity_id = $1 AND currency = $2 RETURNING 1', [entityId, from, to])).rowCount
    if (flipped) {
      const ms = (await c.query<{ m: string }>("SELECT DISTINCT to_char(month, 'YYYY-MM') AS m FROM financials.customer_revenue WHERE entity_id = $1", [entityId])).rows.map((x) => x.m)
      for (const m of ms) { const k = book.convert(from, to, m); if (k) await c.query('UPDATE financials.customer_revenue SET amount = round(amount * $3::numeric, 2) WHERE entity_id = $1 AND month = $2::date', [entityId, m + '-01', k.rate]) }
      const k0 = book.convert(from, to, ms.sort().pop() ?? new Date().toISOString().slice(0, 7))
      if (k0) await c.query('UPDATE financials.customers SET acquisition_cost = round(acquisition_cost * $2::numeric, 2), updated_at = now() WHERE entity_id = $1 AND acquisition_cost IS NOT NULL', [entityId, k0.rate])
      await c.query("DELETE FROM financials.analyses WHERE subject LIKE 'customers:%' OR subject LIKE 'advice:%'")
    }
    await c.query('COMMIT')
  } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err } finally { c.release() }
}
// The companies that have customer revenue (all of them in the group view).
export async function entitiesWithCustomers(): Promise<string[]> {
  return (await db().query<{ e: string }>('SELECT DISTINCT entity_id AS e FROM financials.customers WHERE entity_id IS NOT NULL')).rows.map((r) => r.e)
}
// Customer revenue can be tens of thousands of rows, read by several pages, boards, reports and the analysis, so each
// workspace's copy is kept in memory until the data changes (the stamp: counts, totals and the last edit).
const CACHE = new Map<string, { stamp: string; data: Cust[] }>()
export async function customerStamp(): Promise<string> {
  const r = (await db().query<Record<string, string>>(`SELECT (SELECT count(*) FROM financials.customers) AS c, (SELECT max(updated_at) FROM financials.customers)::text AS u,
    (SELECT max(updated_at) FROM financials.customer_config)::text AS g, (SELECT max(updated_at) FROM fx.monthly)::text AS f,
    count(*) AS n, coalesce(sum(amount), 0)::text AS s, max(month)::text AS m FROM financials.customer_revenue`).catch(() => ({ rows: [] as Record<string, string>[] }))).rows[0]
  return (custEntityId() ?? 'group') + JSON.stringify(r ?? {})
}
export async function loadCustomers(): Promise<Cust[]> {
  const org = currentOrgId(), stamp = await customerStamp(), key = (org ?? '') + '|' + (custEntityId() ?? 'group')
  const hit = org ? CACHE.get(key) : undefined
  if (hit && hit.stamp === stamp) return hit.data
  const data = await loadCustomersFresh()
  if (org) { CACHE.delete(key); CACHE.set(key, { stamp, data }); if (CACHE.size > 30) CACHE.delete(CACHE.keys().next().value!) }
  return data
}
async function loadCustomersFresh(): Promise<Cust[]> {
  const cs = await db().query<Omit<Cust, 'rev'> & { entity_id: string | null; key: string }>(`SELECT id, entity_id, key, name, segment, sector, country, plan, to_char(started_on, 'YYYY-MM-DD') AS started_on, acquisition_cost::float8 AS acquisition_cost, gross_margin_pct::float8 AS gross_margin_pct FROM financials.customers ORDER BY name`)
  const rv = await db().query<{ customer_id: string; m: string; amount: number }>(`SELECT customer_id, to_char(month, 'YYYY-MM') AS m, amount::float8 AS amount FROM financials.customer_revenue`)
  const by = new Map<string, Record<string, number>>()
  for (const r of rv.rows) { const o = by.get(r.customer_id) ?? {}; o[r.m] = r.amount; by.set(r.customer_id, o) }
  const ents = new Set(cs.rows.map((c) => c.entity_id))
  const plain = (c: (typeof cs.rows)[number]): Cust => { const { entity_id: _e, key: _k, ...x } = c; return { ...x, rev: by.get(c.id) ?? {} } }
  if (custEntityId() || ents.size <= 1) return cs.rows.map(plain)
  // The group: each company's revenue converted to the group currency at its book rate for the month, and a customer
  // who buys from more than one company counted once (matched by name), so moving between companies is not churn.
  const to = await groupCurrency(), book = await rateBook()
  const cfg = new Map((await configRows()).map((r) => [r.entity_id, r.currency]))
  const entCur = new Map((await custEntities()).map((e) => [e.id, e.currency]))
  // Up to the latest month every company has reached: a company a month behind is not lost customers (boards, reports
  // and the analysis read the group this way too).
  const lastOf = new Map<string, string>()
  for (const c of cs.rows) for (const m of Object.keys(by.get(c.id) ?? {})) if (m > (lastOf.get(c.entity_id ?? '') ?? '')) lastOf.set(c.entity_id ?? '', m)
  const common = [...lastOf.values()].sort()[0] ?? ''
  const merged = new Map<string, Cust>()
  for (const c of cs.rows) {
    const cur = cfg.get(c.entity_id) ?? entCur.get(c.entity_id ?? '') ?? to
    const rev: Record<string, number> = {}
    for (const [m, v] of Object.entries(by.get(c.id) ?? {})) { if (common && m > common) continue; const k = book.convert(cur, to, m); if (k) rev[m] = Math.round(v * k.rate * 100) / 100 }
    const ex = merged.get(c.key)
    if (!ex) { merged.set(c.key, { ...plain(c), rev, acquisition_cost: c.acquisition_cost != null ? Math.round(c.acquisition_cost * (book.convert(cur, to, c.started_on?.slice(0, 7) ?? Object.keys(rev).sort()[0] ?? '')?.rate ?? 1) * 100) / 100 : null }); continue }
    for (const [m, v] of Object.entries(rev)) ex.rev[m] = Math.round(((ex.rev[m] ?? 0) + v) * 100) / 100
    ex.segment ??= c.segment; ex.sector ??= c.sector; ex.country ??= c.country; ex.plan ??= c.plan
    if (c.started_on && (!ex.started_on || c.started_on < ex.started_on)) ex.started_on = c.started_on
  }
  return [...merged.values()]
}
// Monthly revenue and gross margin as entered in Financials (company workspaces), in the customer data's currency: the
// company's own, or the group's consolidated revenue for the group view.
export async function financialsRevenue(currency: string): Promise<{ revenue: Record<string, number>; gm: number | null }> {
  // The company the customers are for; the group's consolidated figures when they are combined.
  const one = custEntityId(), withData = one ? [] : await entitiesWithCustomers()
  const ent = one ?? (withData.length === 1 ? withData[0]! : null) ?? (withData.length ? null : await companyEntityId().catch(() => null))
  const subject = ent ? 'entity:' + ent : 'group'
  const rows = await loadStatements(subject, 'month', currency, { raw: true }).catch(() => [])
  const revenue: Record<string, number> = {}
  let gp = 0, rv = 0
  for (const r of rows.filter((x) => x.currency === currency)) {
    const d = deriveLines(r.lines, 1)
    if (typeof d.revenue === 'number') revenue[r.period_end.slice(0, 7)] = d.revenue
  }
  for (const r of rows.filter((x) => x.currency === currency).slice(-12)) { const d = deriveLines(r.lines, 1); if (typeof d.revenue === 'number' && typeof d.gross_profit === 'number') { rv += d.revenue; gp += d.gross_profit } }
  return { revenue, gm: rv > 0 ? Math.max(-1, Math.min(1, gp / rv)) : null }
}
