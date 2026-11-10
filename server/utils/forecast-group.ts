import type { ForecastScope } from '~/server/utils/forecast-scope'
// The group forecast: for each company, the forecast it uses (its main one, else the newest) and the rate to the
// reporting currency (the plan rate the team set, else the company's latest book rate, else today's rate).
export async function groupForecast(sc: ForecastScope) {
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
