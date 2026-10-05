// GET /api/v1/financials?period_type=month[&subject=entity:<id>] — your statements (original currency).
export default defineEventHandler(async (event) => {
  const k = await requireApiKey(event, 'read')
  const q = getQuery(event), pt = ['month', 'quarter', 'year'].includes(String(q.period_type)) ? String(q.period_type) : 'month'
  const subj = await apiSubject(k.kind, q.subject)
  const rows = await loadStatements(subj, pt, 'USD', { raw: true })
  return { data: rows.map((r) => ({ period_end: r.period_end, period_type: r.period_type, currency: r.currency, lines: r.lines, kpis: r.kpis, metrics: derive(r.lines, pt as 'month'), source: r.source })) }
})
