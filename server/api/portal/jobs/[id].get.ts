// One of the client's jobs: status and everything shared with them (messages, documents with the reason, status changes).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const j = await db().query("SELECT j.id, j.title, j.service, j.status, to_char(j.due_date, 'YYYY-MM-DD') AS due_date, co.name AS company FROM services.jobs j LEFT JOIN services.companies co ON co.id = j.company_id WHERE j.id = $1 AND j.client_id = $2", [id.data, u.clientId])
  if (!j.rows[0]) throw apiError('not_found', 'Not found', 404)
  const ev = await db().query(
    `SELECT e.id, e.kind, e.body, e.to_status, e.created_at, e.created_by IS NULL AS from_client, d.id AS document_id, d.title AS document
       FROM services.job_events e LEFT JOIN core.documents d ON d.id = e.document_id WHERE e.job_id = $1 AND e.visible_to_client ORDER BY e.created_at DESC`, [id.data])
  const inv = (await db().query<{ id: string; number: string; currency: string; amount: string; status: string; paid_via: string | null; overdue: boolean }>("SELECT id, number, currency, amount::text, status, paid_via, (status = 'sent' AND due_date < current_date) AS overdue FROM services.invoices WHERE job_id = $1 AND client_id = $2 AND status NOT IN ('draft','void') ORDER BY issue_date", [id.data, u.clientId])).rows
  const invoices = await Promise.all(inv.map(async (i) => ({ ...i, link: await billUrl(i.id) })))
  return { job: j.rows[0], events: ev.rows, invoices }
})
