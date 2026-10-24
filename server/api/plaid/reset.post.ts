// Start over with every live bank: each connection's payments are cleared and brought in again from the bank (in the
// background). Categories set by hand are put back; "always" rules apply anyway.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const items = (await db().query<{ id: string }>('SELECT id FROM banking.plaid_items WHERE wm_client_id IS NULL AND error IS NULL')).rows
  if (items.length) await db().query('UPDATE banking.plaid_items SET needs_sync = true WHERE id = ANY($1::uuid[])', [items.map((i) => i.id)])
  inBackground('plaid-reset', async () => { for (const it of items) await resyncPlaidItem(it.id).catch((e) => console.error('[plaid reset]', it.id, (e as Error).message)) })
  await audit({ event, actorUserId: user.userId, action: 'plaid.reset', objectType: 'plaid_item', detail: { connections: items.length } })
  return { ok: true, connections: items.length }
})
