// The workspace's own plan, subscription and invoices (admins). Drafts are not shown.
export default defineEventHandler(async (event) => {
  const s = await requireRole(event, 'admin')
  const country = String(((await currentOrg())?.settings as Record<string, unknown> | undefined)?.country ?? '')
  return await asPlatform(async () => {
    const sub = await db().query<{ plan: string; billing: string; method: string; amount_usd: string; start_date: string; status: string }>(
      `SELECT p.name AS plan, s.billing, s.method, s.amount_usd::text, to_char(s.start_date, 'YYYY-MM-DD') AS start_date, s.status
         FROM platform.subscriptions s JOIN core.plans p ON p.code = s.plan_code WHERE s.organization_id = $1 AND s.status <> 'ended'`, [s.orgId])
    const inv = await db().query(
      `SELECT id, number, to_char(issue_date, 'YYYY-MM-DD') AS issue_date, to_char(due_date, 'YYYY-MM-DD') AS due_date, amount::text, currency, status, (status = 'sent' AND due_date < current_date) AS overdue
         FROM platform.invoices WHERE organization_id = $1 AND status <> 'draft' ORDER BY issue_date DESC LIMIT 50`, [s.orgId])
    const cur = sub.rows[0]
    const card = (await db().query<{ provider: string; brand: string | null; last4: string | null }>('SELECT provider, brand, last4 FROM platform.payment_methods WHERE organization_id = $1 AND is_default LIMIT 1', [s.orgId])).rows[0] ?? null
    const rows = await Promise.all((inv.rows as { id: string; status: string; currency: string }[]).map(async (i) => ({ ...i, payUrl: i.status === 'sent' && providersFor(i.currency).length ? await payUrl(i.id, s.orgId!) : null })))
    return { subscription: cur ? { ...cur, renews: nextRenewal(cur.start_date, cur.billing) } : null, invoices: rows, card, country }
  })
})
