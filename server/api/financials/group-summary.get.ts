import { deriveLines } from '~/shared/fin-view'
// A company with subsidiaries: each one's latest figures in its own currency and converted, and the group's totals for
// the latest month every entity has reported (so a subsidiary that is behind does not make the group look smaller).
// Display only, at the latest daily rate; stored figures are unchanged. Sales between the group companies (intercompany
// revenue, see intercompany.ts) are taken out of the group's revenue; each company's own row keeps them.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  await requireModule(event, 'financials')
  const org = (await currentOrg())!
  if (org.kind !== 'company') return null
  const to = (org.settings.reporting_currency as string) || 'USD'
  const ents = (await db().query<{ id: string; name: string; currency: string | null; main: boolean }>("SELECT id, name, currency, parent_id IS NULL AS main FROM core.entities WHERE kind = 'operating' AND status <> 'closed' ORDER BY (parent_id IS NOT NULL), created_at")).rows
  if (ents.length < 2) return null
  const today = new Date().toISOString().slice(0, 10), base = (org.settings.currency as string) || 'USD'
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  type Row = Record<string, number | null> & { m: string }
  interface Item { id: string; name: string; main: boolean; currency: string; rate: number | null; latest: string | null; months: Row[]; revenue: number | null; net_income: number | null; cash: number | null; cash_at: string | null; ttm_revenue: number | null }
  const list: Item[] = []
  const tagged = new Set((await db().query<{ name: string }>('SELECT lower(name) AS name FROM financials.accounts WHERE intercompany').catch(() => ({ rows: [] as { name: string }[] }))).rows.map((x) => x.name))
  const icRev = (det: Record<string, number> | undefined) => Object.entries(det ?? {}).reduce((s, [k, v]) => { const i = k.indexOf('|'); return k.slice(0, i) === 'revenue' && typeof v === 'number' && isIntercompany(k.slice(i + 1), tagged) ? s + v : s }, 0)
  for (const e of ents) {
    const rows = (await loadStatements('entity:' + e.id, 'month', to, { raw: true }).catch(() => [])).filter((r) => r.period_end <= today && Object.keys(r.lines).length)
    const cur = rows[rows.length - 1]?.currency ?? e.currency ?? base
    const rate = cur === to ? 1 : await fxRate(cur, to)
    const d: Row[] = rows.map((r) => ({ ...deriveLines(r.lines, 1), m: r.period_end.slice(0, 7), ic_rev: icRev(r.detail) }) as unknown as Row)
    const last = d[d.length - 1]
    const cashRow = [...d].reverse().find((x) => num(x.cash) !== null)
    list.push({ id: e.id, name: e.name, main: e.main, currency: cur, rate, latest: last?.m ?? null, months: d,
      revenue: num(last?.revenue), net_income: num(last?.net_income), cash: num(cashRow?.cash), cash_at: cashRow?.m ?? null,
      ttm_revenue: d.length ? d.slice(-12).reduce((s, x) => s + (num(x.revenue) ?? 0), 0) : null })
  }
  const withData = list.filter((x) => x.latest)
  // The latest month every entity with figures has reached.
  const common = withData.length ? withData.map((x) => x.latest!).sort()[0]! : null
  const conv = (v: number | null, k: number | null) => (v === null || !k ? null : Math.round(v * k))
  const at = (x: Item, m: string, key: string) => num(x.months.find((r) => r.m === m)?.[key])
  const cashAt = (x: Item, m: string) => { const r = [...x.months].reverse().find((r) => r.m <= m && num(r.cash) !== null); return r ? num(r.cash) : null }
  const months = common ? Array.from({ length: 12 }, (_, i) => { const d = new Date(common + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 11 + i); return d.toISOString().slice(0, 7) }) : []
  const series = months.map((m) => {
    let revenue = 0, net = 0, cash = 0, n = 0, ic = 0
    for (const x of withData) { const r = at(x, m, 'revenue'); if (r !== null && x.rate) { const k = at(x, m, 'ic_rev') ?? 0; revenue += (r - k) * x.rate; ic += k * x.rate; n++ } const ni = at(x, m, 'net_income'); if (ni !== null && x.rate) net += ni * x.rate; const c = cashAt(x, m); if (c !== null && x.rate) cash += c * x.rate }
    return { month: m, revenue: Math.round(revenue), net_income: Math.round(net), cash: Math.round(cash), entities: n, ic_revenue: Math.round(ic) }
  })
  const maxLatest = withData.map((x) => x.latest!).sort().pop() ?? ''
  const missingRate = list.filter((x) => x.latest && !x.rate).map((x) => x.currency)
  return { currency: to, rate_as_of: (await fxRates()).asOf, common, entities: list.map(({ months: ms, ...x }) => ({ ...x, revenue_conv: conv(x.revenue, x.rate), net_income_conv: conv(x.net_income, x.rate), cash_conv: conv(x.cash, x.rate), ttm_conv: conv(x.ttm_revenue, x.rate),
    at_common: common ? { revenue: conv(at({ ...x, months: ms }, common, 'revenue'), x.rate), net_income: conv(at({ ...x, months: ms }, common, 'net_income'), x.rate), cash: conv(cashAt({ ...x, months: ms }, common), x.rate) } : null, behind: !!x.latest && x.latest < maxLatest })),
    total: series[series.length - 1] ?? null, ttm: series.reduce((s, x) => s + x.revenue, 0), series: series.filter((x) => x.entities > 0), complete: series.map((x) => x.entities === withData.length), missing_rate: [...new Set(missingRate)], without_figures: list.filter((x) => !x.latest).map((x) => x.name) }
})
