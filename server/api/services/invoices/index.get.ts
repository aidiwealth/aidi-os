// Client invoices with outstanding and overdue totals per currency.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const r = await db().query<{ id: string; number: string; client_id: string; client: string; company: string | null; currency: string; amount: string; status: string; issue_date: string; due_date: string; overdue: boolean; job_id: string | null; job: string | null; paid_via: string | null; country: string | null; tax_amount: string }>(
    `SELECT i.id, i.number, i.client_id, c.name AS client, co.name AS company, i.currency, i.amount::text, i.status, to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
            (i.status = 'sent' AND i.due_date < current_date) AS overdue, i.job_id, j.title AS job, i.paid_via, i.country, i.tax_amount::text
       FROM services.invoices i JOIN services.clients c ON c.id = i.client_id LEFT JOIN services.companies co ON co.id = i.company_id LEFT JOIN services.jobs j ON j.id = i.job_id ORDER BY i.issue_date DESC, i.number DESC LIMIT 500`)
  const tot = (cur: string, f: (x: typeof r.rows[number]) => boolean) => r.rows.filter((x) => x.currency === cur && f(x)).reduce((s, x) => s + Number(x.amount), 0)
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  return { invoices: r.rows, kpis: ['USD', 'NGN'].map((c) => ({ currency: c, outstanding: tot(c, (x) => x.status === 'sent'), overdue: tot(c, (x) => x.overdue), paid30: tot(c, (x) => x.status === 'paid' && x.issue_date >= since) })) }
})
