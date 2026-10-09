// The client's service jobs with the invoices raised for each (and how they were paid).
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const rows = (await db().query<{ id: string; title: string; status: string; company: string | null; created_at: string; invoices: { id: string; number: string; currency: string; amount: number; status: string; paid_via: string | null; overdue: boolean }[] }>(
    `SELECT j.id, j.title, j.status, co.name AS company, to_char(j.created_at, 'YYYY-MM-DD') AS created_at,
            coalesce((SELECT json_agg(json_build_object('id', i.id, 'number', i.number, 'currency', i.currency, 'amount', i.amount, 'status', i.status, 'paid_via', i.paid_via, 'overdue', i.status = 'sent' AND i.due_date < current_date) ORDER BY i.issue_date)
                      FROM services.invoices i WHERE i.job_id = j.id AND i.status NOT IN ('draft','void')), '[]'::json) AS invoices
       FROM services.jobs j LEFT JOIN services.companies co ON co.id = j.company_id WHERE j.client_id = $1 AND j.status <> 'cancelled' ORDER BY j.created_at DESC`, [u.clientId])).rows
  const out = []
  for (const j of rows) out.push({ ...j, invoices: await Promise.all(j.invoices.map(async (i) => ({ ...i, link: await billUrl(i.id) }))) })
  return out
})
