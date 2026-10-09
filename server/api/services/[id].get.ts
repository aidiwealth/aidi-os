import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Job not found', 404)
  const j = await db().query(
    `SELECT j.id, j.codes, j.title, j.service, j.description, j.status, j.priority, to_char(j.due_date, 'YYYY-MM-DD') AS due_date, j.fee_usd::text,
            j.owner_id, j.company_id, j.created_at, j.completed_at, (j.client_token_expires > now()) AS link_active, j.client_token_expires,
            c.id AS client_id, c.name AS client, c.contact_name, c.email, c.phone, c.country
       FROM services.jobs j JOIN services.clients c ON c.id = j.client_id WHERE j.id = $1`, [id.data])
  if (j.rowCount !== 1) throw apiError('not_found', 'Job not found', 404)
  const levels = visibleLevels(user.roles)
  const ev = await db().query(
    `SELECT e.id, e.kind, e.body, e.from_status, e.to_status, e.visible_to_client, e.created_at, p.full_name AS by_name,
            CASE WHEN d.sensitivity = ANY($2::text[]) THEN d.id END AS document_id, d.title AS document_title
       FROM services.job_events e LEFT JOIN core.users u ON u.id = e.created_by LEFT JOIN core.people p ON p.id = u.person_id
       LEFT JOIN core.documents d ON d.id = e.document_id WHERE e.job_id = $1 ORDER BY e.created_at DESC`, [id.data, levels])
  const companies = await db().query('SELECT id, name FROM services.companies WHERE client_id = $1 ORDER BY name', [(j.rows[0] as { client_id: string }).client_id])
  const invoices = (await db().query("SELECT id, number, currency, amount::text, tax_amount::text, status, paid_via, to_char(issue_date, 'YYYY-MM-DD') AS issue_date, (status = 'sent' AND due_date < current_date) AS overdue FROM services.invoices WHERE job_id = $1 ORDER BY issue_date DESC", [id.data])).rows
  const wallet = await clientWallet((j.rows[0] as { client_id: string }).client_id)
  return { job: j.rows[0], events: ev.rows, companies: companies.rows, invoices, wallet }
})
