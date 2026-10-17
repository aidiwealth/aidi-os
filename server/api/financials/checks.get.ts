// Where saved figures do not add up (every period type): flagged for the founder to correct at the source.
import { checkRows, deriveLines } from '~/shared/fin-view'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'family')
  const subject = String(getQuery(event).subject ?? '')
  if (!subject || subject === 'group') return { checks: [] }
  const today = new Date().toISOString().slice(0, 10)
  const out = []
  for (const t of ['month', 'quarter', 'year'] as const) {
    const rows = (await loadStatements(subject, t, 'USD', { raw: true })).filter((r) => r.period_end <= today)
    out.push(...checkRows(rows.map((r) => ({ period_end: r.period_end, period_type: r.period_type, currency: r.currency, lines: r.lines, kpis: r.kpis ?? {}, derived: deriveLines(r.lines, 1) }))).map((c) => ({ ...c, source: rows.find((r) => r.period_end === c.period_end)?.source ?? null })))
  }
  return { checks: out.sort((a, b) => (a.period_end < b.period_end ? 1 : -1)).slice(0, 60) }
})
