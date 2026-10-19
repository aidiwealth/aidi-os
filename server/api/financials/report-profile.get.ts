// The details the annual report needs that only the founder knows (directors, CFO, offices, advisers, bankers),
// what is still missing, and the years the report can cover.
import { type FinRow, deriveLines } from '~/shared/fin-view'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'admin')
  const q = getQuery(event)
  const r = await reportProfile()
  let years: { year: number; label: string; months: number }[] = []
  if (typeof q.subject === 'string' && /^(group|(entity|company):[0-9a-f-]{36})$/.test(q.subject)) {
    const org = (await currentOrg())!, raw: FinRow[] = []
    for (const t of ['month', 'year'] as const) for (const x of await loadStatements(q.subject, t, await subjectCurrency(q.subject))) raw.push({ period_end: x.period_end, period_type: x.period_type, currency: x.currency, lines: x.lines, kpis: x.kpis ?? {}, derived: deriveLines(x.lines, 1) })
    years = reportYears(raw, r.profile.fye_month || 12)
  }
  // Share classes on the cap table, so authorised shares and par value can be given for each.
  const classes = (await db().query<{ name: string }>('SELECT c.name FROM equity.classes c JOIN equity.captables t ON t.id = c.captable_id ORDER BY t.is_main DESC, c.seniority, c.created_at').catch(() => ({ rows: [] }))).rows.map((x) => x.name)
  return { ...r, years, classes: [...new Set(classes)] }
})
