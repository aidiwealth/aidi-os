// A tax information request: answers, uploaded files and the questions they answer.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const r = await db().query(
    `SELECT r.id, r.client_id, c.name AS client, r.company_id, co.name AS company, r.job_id, r.tax_year, r.sent_to, r.status, r.answers, r.submitted_at, r.created_at, (r.expires_at > now()) AS link_active
       FROM services.info_requests r JOIN services.clients c ON c.id = r.client_id LEFT JOIN services.companies co ON co.id = r.company_id WHERE r.id = $1`, [id.data])
  if (!r.rows[0]) throw apiError('not_found', 'Not found', 404)
  const files = await db().query('SELECT f.field, d.id, d.title, d.size_bytes FROM services.request_files f JOIN core.documents d ON d.id = f.document_id WHERE f.request_id = $1 ORDER BY f.created_at', [id.data])
  return { request: r.rows[0], files: files.rows, questions: taxQuestions((r.rows[0] as { tax_year: number }).tax_year) }
})
