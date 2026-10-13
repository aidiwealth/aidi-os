// Every payment received from clients, old and new, in one place: paid service invoices (card, transfer, recorded
// by hand, or from the wallet), and for platform staff also paid Finvry plan invoices and wallet top-ups.
// An invoice paid from the wallet is listed but not counted again: the top-up that funded it is the money received.
interface P { src: 'invoice' | 'subscription' | 'topup'; id: string; ref: string; client_key: string; client_id: string | null; client: string; currency: string; amount: number; date: string; method: string | null; what: string | null; link: string | null; counted: boolean }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const inv = (await db().query<Omit<P, 'counted' | 'client_key'>>(
    `SELECT 'invoice' AS src, i.id, i.number AS ref, i.client_id, c.name AS client, i.currency, i.amount::float AS amount, to_char(coalesce(i.paid_at, i.issue_date), 'YYYY-MM-DD') AS date, i.paid_via AS method,
            coalesce(j.title, i.lines->0->>'description') AS what, '/services/invoices/' || i.id AS link
       FROM services.invoices i JOIN services.clients c ON c.id = i.client_id LEFT JOIN services.jobs j ON j.id = i.job_id WHERE i.status = 'paid'`)).rows
  let more: Omit<P, 'counted' | 'client_key'>[] = []
  if (user.platform) {
    const op = await operatorOrgId()
    more = (await asPlatform(() => db().query<Omit<P, 'counted' | 'client_key'>>(
      `WITH cl AS (SELECT DISTINCT ON (workspace_id) workspace_id, id, name FROM services.clients WHERE organization_id = $1 AND workspace_id IS NOT NULL ORDER BY workspace_id, created_at)
       SELECT 'subscription' AS src, pi.id, pi.number AS ref, coalesce(cl.id::text, 'ws:' || o.id) AS client_id, coalesce(cl.name, o.name) AS client, pi.currency, pi.amount::float AS amount, to_char(coalesce(pi.paid_at, pi.issue_date), 'YYYY-MM-DD') AS date, pi.paid_via AS method, 'Finvry plan' AS what, '/invoice/' || pi.id AS link
         FROM platform.invoices pi JOIN core.organizations o ON o.id = pi.organization_id LEFT JOIN cl ON cl.workspace_id = o.id WHERE pi.status = 'paid' AND o.kind = 'company'
       UNION ALL
       SELECT 'topup', t.id, t.reference, coalesce(cl.id::text, 'ws:' || o.id), coalesce(cl.name, o.name), t.currency, t.amount_minor / 100.0, to_char(coalesce(t.completed_at, t.created_at), 'YYYY-MM-DD'), t.provider, 'Wallet top-up', NULL
         FROM wallet.topups t JOIN core.organizations o ON o.id = t.organization_id LEFT JOIN cl ON cl.workspace_id = o.id WHERE t.status = 'succeeded'`, [op]))).rows
  }
  const rows: P[] = [...inv, ...more].map((p) => ({ ...p, amount: Number(p.amount), client_key: p.client_id ?? p.client, client_id: p.client_id && /^[0-9a-f-]{36}$/.test(p.client_id) ? p.client_id : null, counted: p.method !== 'wallet' }))
    .sort((a, b) => b.date.localeCompare(a.date))
  return { rows, platform: user.platform }
})
