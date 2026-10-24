// How live banks are getting on: each connection, whether it is still bringing in payments, and how many it has so
// far (Banking shows this while a bank is being connected, reconnected or started over).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  const r = await db().query<{ id: string; institution: string | null; error: string | null; syncing: boolean; payments: number }>(`
    SELECT i.id, i.institution, i.error, (i.needs_sync OR i.synced_at IS NULL) AS syncing,
           (SELECT count(*)::int FROM banking.ledger l JOIN banking.plaid_accounts a ON a.item_id = i.id
             WHERE l.source = 'bank_feed' AND l.account_label = coalesce(i.institution, 'Bank') || ' · ' || a.name || coalesce(' ··' || a.mask, '')) AS payments
      FROM banking.plaid_items i WHERE i.wm_client_id IS NULL ORDER BY i.created_at`)
  return { items: r.rows }
})
