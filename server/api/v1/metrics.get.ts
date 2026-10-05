// GET /api/v1/metrics — the latest period's key metrics (revenue, margins, burn, runway, cash…), in your reporting currency.
export default defineEventHandler(async (event) => {
  const k = await requireApiKey(event, 'read')
  const q = getQuery(event), subj = await apiSubject(k.kind, q.subject)
  const rows = await loadStatements(subj, 'month', 'USD')
  const last = rows[rows.length - 1]
  return { data: last ? { period_end: last.period_end, currency: last.currency, metrics: derive(last.lines, 'month') } : null }
})
