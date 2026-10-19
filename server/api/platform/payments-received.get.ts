// Finvry Platform → Payments: money received for the platform only. Paid plan invoices (subscriptions and renewals)
// and wallet top-ups. Service invoices are on Finvry Services → Payments.
export default defineEventHandler(async (event) => {
  await requirePlatformView(event)
  const rows = (await asPlatform(() => db().query<{ src: 'plan' | 'topup'; id: string; ref: string; organization_id: string; customer: string; currency: string; amount: number; date: string; method: string | null; what: string | null }>(
    `SELECT 'plan' AS src, pi.id, pi.number AS ref, o.id AS organization_id, o.name AS customer, pi.currency, pi.amount::float8 AS amount, to_char(coalesce(pi.paid_at, pi.issue_date), 'YYYY-MM-DD') AS date, pi.paid_via AS method,
            coalesce(pi.lines->0->>'description', 'Finvry plan') AS what
       FROM platform.invoices pi JOIN core.organizations o ON o.id = pi.organization_id WHERE pi.status = 'paid' AND o.kind = 'company'
     UNION ALL
     SELECT 'topup', t.id, t.reference, o.id, o.name, t.currency, t.amount_minor / 100.0, to_char(coalesce(t.completed_at, t.created_at), 'YYYY-MM-DD'), t.provider, 'Wallet top-up'
       FROM wallet.topups t JOIN core.organizations o ON o.id = t.organization_id WHERE t.status = 'succeeded' AND o.kind = 'company'
     ORDER BY 8 DESC`))).rows
  return { rows: rows.map((r) => ({ ...r, amount: Number(r.amount) })) }
})
