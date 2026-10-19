// The group's exchange rates, month by month: for each currency a company in the group reports in, the company's own
// book rate (when set) and the rate the group figures used, with where it came from (fx-book.ts).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'financials')
  const org = (await currentOrg())!
  const to = (org.settings.reporting_currency as string) || (org.settings.currency as string) || 'USD'
  const curs = (await db().query<{ c: string }>("SELECT DISTINCT s.currency AS c FROM financials.statements s WHERE s.entity_id IS NOT NULL AND s.period_type = 'month'")).rows.map((r) => r.c).filter((c) => c !== 'USD' || to !== 'USD')
  const months = (await db().query<{ m: string }>("SELECT DISTINCT to_char(period_end, 'YYYY-MM') AS m FROM financials.statements WHERE entity_id IS NOT NULL AND period_type = 'month' ORDER BY 1 DESC")).rows.map((r) => r.m)
  const own = (await db().query<{ quote: string; m: string; v: number; source: string }>("SELECT quote, to_char(month, 'YYYY-MM') AS m, per_usd::float8 AS v, source FROM fx.monthly")).rows
  const book = await rateBook()
  const quotes = [...new Set([...curs, ...(to !== 'USD' ? [to] : [])])].filter((c) => c !== 'USD').sort()
  return { to, quotes, rows: months.map((m) => ({ month: m, rates: Object.fromEntries(quotes.map((q) => [q, { book: own.find((x) => x.quote === q && x.m === m)?.v ?? null, used: book.perUsd(q, m) }])) })) }
})
