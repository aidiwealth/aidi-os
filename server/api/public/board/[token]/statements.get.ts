// The financial statements on a shared board (when the board shows them): the same figures as Financials, read-only,
// for the group or one of its companies.
import { withSecurities } from '~/shared/fin-view'
export default defineEventHandler(async (event) => {
  const b = await boardByToken(event)
  await requireBoardAccess(event, b)
  if (!b.sections?.statements) throw apiError('not_found', 'Not found', 404)
  await rateLimit('board_stmts', clientIp(event), 300, 60 * 60 * 1000)
  const q = getQuery(event), subject = String(q.subject ?? 'group'), currency = /^[A-Z]{3}$/.test(String(q.currency ?? '')) ? String(q.currency) : 'USD'
  const ents = await custEntities().catch(() => []), own = await companyEntityId().catch(() => null)
  if (!(subject === 'group' || ents.some((e) => 'entity:' + e.id === subject) || (own && subject === 'entity:' + own))) throw apiError('invalid', 'Bad filter.')
  const rows = await loadStatements(subject, 'month', currency)
  const sec = await cashPolicy()
  return { name: await subjectName(subject), safe_treatment: await safeTreatment(), statements: rows.map((r) => ({ ...r, derived: withSecurities(derive(r.lines, r.period_type), sec) })) }
})
