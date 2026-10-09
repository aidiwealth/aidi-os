// Jobs with what has been invoiced and paid for each, and jobs not invoiced yet.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const rows = (await db().query<{ id: string; title: string; status: string; client_id: string; client: string; company: string | null; created_at: string; invoices: { id: string; number: string; currency: string; amount: number; status: string; paid_via: string | null; overdue: boolean }[] }>(
    `SELECT j.id, j.title, j.status, j.client_id, c.name AS client, co.name AS company, to_char(j.created_at, 'YYYY-MM-DD') AS created_at,
            coalesce((SELECT json_agg(json_build_object('id', i.id, 'number', i.number, 'currency', i.currency, 'amount', i.amount, 'status', i.status, 'paid_via', i.paid_via, 'overdue', i.status = 'sent' AND i.due_date < current_date) ORDER BY i.issue_date)
                      FROM services.invoices i WHERE i.job_id = j.id AND i.status <> 'void'), '[]'::json) AS invoices
       FROM services.jobs j JOIN services.clients c ON c.id = j.client_id LEFT JOIN services.companies co ON co.id = j.company_id
      WHERE j.status <> 'cancelled' ORDER BY j.created_at DESC LIMIT 500`)).rows
  return rows
})
