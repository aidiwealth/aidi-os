import { addMonths, defaults } from '~/shared/forecast'
// Forecasts for this company: the saved ones, the last 12 months of actuals, live bank data (cash now, money in and
// out by month), and a starting point built from both: costs and growth from the statements, cash from the bank.
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
  const thisMonth = now.toISOString().slice(0, 7)
  const bank = getQuery(event).bank === '0' ? null : await bankSnapshot(currency).catch((e) => { console.error('[forecast] bank', e); return null })
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
  const forecasts = (await db().query("SELECT id, name, updated_at, assumptions->>'start' AS start, (assumptions->>'months')::int AS months FROM financials.forecasts ORDER BY updated_at DESC")).rows
  const st = await shareStats('forecast')
  return { currency, actuals, seed, fin, bank: bank ? { ...bank, partial: !!coverage?.partial, reported: coverage?.reported ?? null, reported_as_of: coverage?.as_of ?? null } : bank, live, forecasts: forecasts.map((f: { id: string }) => ({ ...f, views: st[f.id]?.views ?? 0, links: st[f.id]?.links ?? 0 })), has_actuals: actuals.length > 0 }
})
