// The portal home: what is due, open work, recent documents and messages, forms waiting.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const due = await db().query<{ currency: string; v: string; n: number }>("SELECT currency, sum(amount)::text AS v, count(*)::int AS n FROM services.invoices WHERE client_id = $1 AND status = 'sent' GROUP BY currency", [u.clientId])
  const jobs = await db().query(
    `SELECT j.id, j.title, j.service, j.status, to_char(j.due_date, 'YYYY-MM-DD') AS due_date, j.updated_at, co.name AS company FROM services.jobs j LEFT JOIN services.companies co ON co.id = j.company_id
      WHERE j.client_id = $1 AND j.status <> 'cancelled' ORDER BY (j.status = 'completed'), j.updated_at DESC LIMIT 30`, [u.clientId])
  const docs = await db().query(
    `SELECT d.id, d.title, e.body AS reason, e.created_at, j.title AS job FROM services.job_events e JOIN services.jobs j ON j.id = e.job_id JOIN core.documents d ON d.id = e.document_id
      WHERE j.client_id = $1 AND e.visible_to_client AND e.kind = 'document' ORDER BY e.created_at DESC LIMIT 5`, [u.clientId])
  const unread = await one<{ n: number }>('SELECT count(*)::int AS n FROM services.messages WHERE client_id = $1 AND from_team AND read_by_client IS NULL', [u.clientId])
  const forms = await db().query("SELECT r.id, r.tax_year, r.status, co.name AS company FROM services.info_requests r LEFT JOIN services.companies co ON co.id = r.company_id WHERE r.client_id = $1 AND r.status IN ('sent','in_progress') ORDER BY r.created_at DESC", [u.clientId])
  return { due: due.rows.map((r) => ({ currency: r.currency, amount: Number(r.v), count: r.n })), jobs: jobs.rows, documents: docs.rows, unread: unread.n, forms: forms.rows }
})
