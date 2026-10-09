// The client's invoices (not drafts) with pay links, and the payments made.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const r = await db().query<{ id: string; number: string; currency: string; amount: string; status: string; issue_date: string; due_date: string; paid_at: string | null; paid_via: string | null; company: string | null; overdue: boolean; lines: { description: string; kind?: string }[]; job_id: string | null; job: string | null; tax_amount: string }>(
    `SELECT i.id, i.number, i.currency, i.amount::text, i.status, to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date, to_char(i.paid_at, 'YYYY-MM-DD') AS paid_at,
            i.paid_via, co.name AS company, (i.status = 'sent' AND i.due_date < current_date) AS overdue, i.lines, i.job_id, j.title AS job, i.tax_amount::text
       FROM services.invoices i LEFT JOIN services.companies co ON co.id = i.company_id LEFT JOIN services.jobs j ON j.id = i.job_id WHERE i.client_id = $1 AND i.status <> 'draft' ORDER BY i.issue_date DESC`, [u.clientId])
  const out = []
  for (const i of r.rows) out.push({ ...i, summary: i.lines.filter((l) => l.kind !== 'tax').map((l) => l.description).slice(0, 3).join(', ') + (Number(i.tax_amount) ? ' (incl. VAT)' : ''), lines: undefined, link: await billUrl(i.id) })
  return out
})
