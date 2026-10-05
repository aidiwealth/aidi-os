// Statements for a subject (or the group), with derived figures.
import { z } from 'zod'
const Q = z.object({ subject: z.string().max(80).default('group'), period_type: z.enum(['month', 'quarter', 'year']).default('month'), currency: z.string().regex(/^[A-Z]{3}$/).default('USD') })
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'family')
  const q = Q.safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Bad filter.')
  const rows = await loadStatements(q.data.subject, q.data.period_type, q.data.currency, { raw: getQuery(event).raw === '1' })
  return { name: await subjectName(q.data.subject), statements: rows.map((r) => ({ ...r, derived: derive(r.lines, r.period_type) })) }
})
