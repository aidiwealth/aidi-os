// Reports uploaded for a company, newest period first.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Company not found', 404)
  return (await db().query("SELECT r.id, r.title, r.period_label, to_char(r.period_end, 'YYYY-MM-DD') AS period_end, r.currency, r.usd_rate::float AS rate, r.months, r.values_saved, r.document_id, to_char(r.imported_at, 'YYYY-MM-DD') AS imported_at, coalesce(p.full_name, u.email) AS by_name FROM portfolio.report_imports r LEFT JOIN core.users u ON u.id = r.imported_by LEFT JOIN core.people p ON p.id = u.person_id WHERE r.company_id = $1 ORDER BY r.period_end DESC NULLS LAST, r.imported_at DESC", [id.data])).rows
})
