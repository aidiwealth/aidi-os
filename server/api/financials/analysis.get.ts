// What the figures say, for the founder: insights and what to raise with the executive team, the CFO and the board.
import { deriveLines, withSecurities, type FinRow } from '~/shared/fin-view'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'admin')
  const q = getQuery(event)
  const subject = String(q.subject ?? '')
  if (subject !== 'group' && !/^(entity|company):[0-9a-f-]{36}$/.test(subject)) throw apiError('invalid', 'Choose a company.')
  if (q.refresh === '1') await rateLimit('fin_analysis', user.userId, 20, 60 * 60 * 1000)
  const org = (await currentOrg())!
  const sec = org.settings.cash_with_securities === true
  const cur = await subjectCurrency(subject)
  let rows = await loadStatements(subject, 'month', cur)
  if (rows.length < 3) rows = await loadStatements(subject, 'quarter', cur)
  const fr: FinRow[] = rows.map((r) => ({ period_end: r.period_end, period_type: r.period_type, currency: r.currency, lines: r.lines, kpis: r.kpis ?? {}, derived: withSecurities(deriveLines(r.lines, r.period_type === 'quarter' ? 3 : r.period_type === 'year' ? 12 : 1), sec) }))
  if (!fr.length) return null
  const model = ((org.settings.business_models as Record<string, string> | undefined) ?? {})[subject] ?? null
  return { ...(await analyseFinancials(subject, fr, fr[fr.length - 1]!.currency, await subjectName(subject), q.refresh === '1', model)), business_model: model }
})
