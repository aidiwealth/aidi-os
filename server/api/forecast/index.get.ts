import { addMonths, defaults } from '~/shared/forecast'
import type { ForecastScope } from '~/server/utils/forecast-scope'
// Forecasts for this company: the saved ones, the last 12 months of actuals, live bank data (cash now, money in and
// out by month), and a starting point built from both: costs and growth from the statements, cash from the bank.
// Each company in a group keeps its own forecasts in its own currency (?cust=<company>); ?cust=group is the group
// forecast: each company's main forecast, converted to the reporting currency, added together on the page.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const org = (await currentOrg())!
  const sc = await forecastScope(event)
  if (sc.group) return await groupForecast(sc)
  const currency = sc.currency
  const ent = sc.entity
  const rows = ent ? (await loadStatements('entity:' + ent, 'month', currency)).slice(-12) : []
  const actuals = rows.map((r) => { const d = derive(r.lines, 'month'), l = r.lines as Record<string, number | null>, v = (k: string) => (typeof l[k] === 'number' ? l[k] as number : null)
    return { month: r.period_end.slice(0, 7), revenue: v('revenue'), cogs: v('cogs'), opex: d.opex_total ?? null, payroll: v('opex_payroll'), marketing: v('opex_marketing'), rnd: v('opex_rnd'), ga: v('opex_ga'), other: v('opex_other'), net_income: d.net_income ?? v('net_income'), cash: v('cash'), gross_margin: d.gross_margin ?? null, burn: d.burn ?? null } })
  const last = actuals[actuals.length - 1]
  const avg = (k: keyof (typeof actuals)[number]) => { const xs = actuals.slice(-3).map((a) => a[k]).filter((x): x is number => typeof x === 'number'); return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0 }
  const kpis = Object.entries(((rows[rows.length - 1] as unknown as { kpis?: Record<string, unknown> } | undefined)?.kpis) ?? {})
  const kv = (re: RegExp) => Number(kpis.find(([k]) => re.test(k))?.[1] ?? 0) || 0
  const now = new Date(); now.setUTCDate(1)
  const thisMonth = now.toISOString().slice(0, 7)
  // Connected bank accounts belong to the main company: a subsidiary's forecast starts from its statements.
  // Nigerian banks need Mono: until it is switched on, a Nigerian company's forecast has no bank connection to offer.
  const ngBlock = (await nigerianBanking(sc.entity)) && !(await monoOn())
  const bank = getQuery(event).bank === '0' || !sc.main || ngBlock ? null : await bankSnapshot(currency).catch((e) => { console.error('[forecast] bank', e); return null })
  const live = !!bank?.connected && bank.accounts.some((a) => !a.debt && a.balance !== null)
  // With a live balance the forecast starts this month from today's cash; otherwise the month after the last statement.
  const start = live ? (last && addMonths(last.month, 1) > thisMonth ? addMonths(last.month, 1) : thisMonth) : last ? addMonths(last.month, 1) : thisMonth
  const revenue = last?.revenue ?? 0, cogsPct = revenue && last?.cogs ? Math.round(last.cogs / revenue * 100) : 30
  const seed = defaults(start, { cash: last?.cash ?? 0, revenue, customers: kv(/customer|client|paying/i), headcount: kv(/headcount|employee|staff/i), payroll: avg('payroll') }, { marketing: avg('marketing'), rnd: avg('rnd'), ga: avg('ga'), other: avg('other') || (actuals.length && !avg('marketing') && !avg('ga') ? Math.max(0, avg('opex') - avg('payroll')) : 0) }, currency)
  seed.cogs_pct = cogsPct
  // Connected accounts are US accounts only: when they are part of the company's cash (a group, or accounts abroad),
  // the forecast starts from the cash in Financials instead.
  const coverage = live ? await bankCoverage(bank!.cash, currency).catch(() => null) : null
  if (live && !coverage?.partial) seed.opening.cash = bank!.cash
  // Revenue growth: the compound monthly rate over the last six months of statements (kept within sensible bounds).
  const revs = actuals.slice(-7).map((a) => a.revenue).filter((x): x is number => typeof x === 'number' && x > 0)
  const trend = revs.length > 2 ? Math.round((Math.pow(revs[revs.length - 1]! / revs[0]!, 1 / (revs.length - 1)) - 1) * 200) / 2 : null
  if (trend !== null) seed.revenue.growth_pct = Math.max(-10, Math.min(30, trend))
  if (!actuals.length && live && bank!.full_months) { seed.opening.revenue = bank!.avg_in; const o = seed.costs.find((c) => c.key === 'other'); if (o) o.amount = bank!.avg_out; seed.cogs_pct = 0 }
  const fin = actuals.length ? { months: actuals.length, latest: last!.month, revenue: avg('revenue'), costs: avg('cogs') + avg('opex'), net: avg('net_income'), growth: trend, cash: last!.cash } : null
  const forecasts = (await db().query("SELECT id, name, updated_at, is_main, assumptions->>'start' AS start, (assumptions->>'months')::int AS months FROM financials.forecasts WHERE entity_id IS NOT DISTINCT FROM $1::uuid ORDER BY updated_at DESC", [ent])).rows
  const st = await shareStats('forecast')
  return { ng_bank: ngBlock, group: false, company: { id: ent, name: sc.name, currency, main: sc.main, companies: sc.companies.length }, currency, actuals, seed, fin, bank: bank ? { ...bank, partial: !!coverage?.partial, reported: coverage?.reported ?? null, reported_as_of: coverage?.as_of ?? null } : bank, live, forecasts: forecasts.map((f: { id: string }) => ({ ...f, views: st[f.id]?.views ?? 0, links: st[f.id]?.links ?? 0 })), has_actuals: actuals.length > 0 }
})

// The group forecast: for each company, the forecast it uses (its main one, else the newest) and the rate to the
// reporting currency (the plan rate the team set, else the company's latest book rate, else today's rate).
async function groupForecast(sc: ForecastScope) {
  const org = (await currentOrg())!
  const to = sc.currency
  const plan = ((org.settings as Record<string, unknown>).forecast_rates ?? {}) as Record<string, number>
  const book = await rateBook()
  const now = new Date().toISOString().slice(0, 7)
  const base = (org.settings.currency as string) || 'USD'
  const all = (await db().query<{ id: string; entity_id: string | null; name: string; updated_at: string; is_main: boolean; assumptions: Record<string, unknown> }>(
    'SELECT id, entity_id, name, updated_at, is_main, assumptions FROM financials.forecasts WHERE entity_id = ANY($1::uuid[]) ORDER BY updated_at DESC', [sc.companies.map((c) => c.id)])).rows
  const companies = sc.companies.map((c) => {
    const cur = c.currency || base
    const mine = all.filter((f) => f.entity_id === c.id)
    const use = mine.find((f) => f.is_main) ?? mine[0] ?? null
    const conv = cur === to ? null : book.convert(cur, to, now)
    // per: units of the company's currency for one unit of the reporting currency.
    const per = cur === to ? 1 : plan[cur] && plan[cur] > 0 ? plan[cur] : conv?.rate ? 1 / conv.rate : null
    const src = cur === to ? 'same' : plan[cur] && plan[cur] > 0 ? 'plan' : conv ? (conv.uses[0]?.source === 'daily' ? 'daily' : 'book') : 'none'
    return { id: c.id, name: c.name, currency: cur, main: c.main, per, rate_source: src, forecasts: mine.map((f) => ({ id: f.id, name: f.name, updated_at: f.updated_at, is_main: f.is_main })),
      use: use ? { id: use.id, name: use.name, assumptions: use.assumptions } : null }
  })
  return { group: true, currency: to, name: sc.name, companies }
}
