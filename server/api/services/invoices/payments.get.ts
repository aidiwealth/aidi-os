// Finvry Services → Payments: every paid service invoice, old and new (card, transfer, recorded by hand, or from the
// client's wallet). Services only: plan invoices and wallet top-ups are under Finvry Platform → Payments.
interface P { src: 'invoice' | 'subscription' | 'topup'; id: string; ref: string; client_key: string; client_id: string | null; client: string; currency: string; amount: number; date: string; method: string | null; what: string | null; link: string | null; counted: boolean }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const inv = (await db().query<Omit<P, 'counted' | 'client_key'>>(
    `SELECT 'invoice' AS src, i.id, i.number AS ref, i.client_id, c.name AS client, i.currency, i.amount::float AS amount, to_char(coalesce(i.paid_at, i.issue_date), 'YYYY-MM-DD') AS date, i.paid_via AS method,
            coalesce(j.title, i.lines->0->>'description') AS what, '/services/invoices/' || i.id AS link
       FROM services.invoices i JOIN services.clients c ON c.id = i.client_id LEFT JOIN services.jobs j ON j.id = i.job_id WHERE i.status = 'paid'`)).rows
  const rows: P[] = inv.map((p) => ({ ...p, amount: Number(p.amount), client_key: p.client_id ?? p.client, client_id: p.client_id && /^[0-9a-f-]{36}$/.test(p.client_id) ? p.client_id : null, counted: true }))
    .sort((a, b) => b.date.localeCompare(a.date))
  void user
  return { rows, platform: false }
})
