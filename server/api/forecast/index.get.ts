import { addMonths, defaults } from '~/shared/forecast'
// Forecasts for this company: the saved ones, the last 12 months of actuals, and a starting point built from them.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const org = (await currentOrg())!
  const currency = (org.settings.currency as string) || 'USD'
  const ent = await companyEntityId()
  const rows = ent ? (await loadStatements('entity:' + ent, 'month', currency)).slice(-12) : []
  const actuals = rows.map((r) => { const d = derive(r.lines, 'month'), l = r.lines as Record<string, number | null>, v = (k: string) => (typeof l[k] === 'number' ? l[k] as number : null)
    return { month: r.period_end.slice(0, 7), revenue: v('revenue'), cogs: v('cogs'), opex: d.opex_total ?? null, payroll: v('opex_payroll'), marketing: v('opex_marketing'), rnd: v('opex_rnd'), ga: v('opex_ga'), other: v('opex_other'), net_income: d.net_income ?? v('net_income'), cash: v('cash'), gross_margin: d.gross_margin ?? null, burn: d.burn ?? null } })
  const last = actuals[actuals.length - 1]
  const avg = (k: keyof (typeof actuals)[number]) => { const xs = actuals.slice(-3).map((a) => a[k]).filter((x): x is number => typeof x === 'number'); return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0 }
  const kpis = Object.entries(((rows[rows.length - 1] as unknown as { kpis?: Record<string, unknown> } | undefined)?.kpis) ?? {})
  const kv = (re: RegExp) => Number(kpis.find(([k]) => re.test(k))?.[1] ?? 0) || 0
  const now = new Date(); now.setUTCDate(1)
  const start = last ? addMonths(last.month, 1) : now.toISOString().slice(0, 7)
  const revenue = last?.revenue ?? 0, cogsPct = revenue && last?.cogs ? Math.round(last.cogs / revenue * 100) : 30
  const seed = defaults(start, { cash: last?.cash ?? 0, revenue, customers: kv(/customer|client|paying/i), headcount: kv(/headcount|employee|staff/i), payroll: avg('payroll') }, { marketing: avg('marketing'), rnd: avg('rnd'), ga: avg('ga'), other: avg('other') || (actuals.length && !avg('marketing') && !avg('ga') ? Math.max(0, avg('opex') - avg('payroll')) : 0) }, currency)
  seed.cogs_pct = cogsPct
  const forecasts = (await db().query("SELECT id, name, updated_at, assumptions->>'start' AS start, (assumptions->>'months')::int AS months FROM financials.forecasts ORDER BY updated_at DESC")).rows
  const st = await shareStats('forecast')
  return { currency, actuals, seed, forecasts: forecasts.map((f: { id: string }) => ({ ...f, views: st[f.id]?.views ?? 0, links: st[f.id]?.links ?? 0 })), has_actuals: actuals.length > 0 }
})
