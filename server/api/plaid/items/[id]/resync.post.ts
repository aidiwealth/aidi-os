// Clear a live bank's transactions and bring them all back from the bank (in the background; it can take a minute).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const it = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ id: string }>('SELECT id FROM banking.plaid_items WHERE id = $1 AND wm_client_id IS NULL', [id])).rows[0] : undefined
  if (!it) throw apiError('not_found', 'Not found', 404)
  await db().query('UPDATE banking.plaid_items SET needs_sync = true WHERE id = $1', [id])
  inBackground('plaid-resync:' + id, () => resyncPlaidItem(id).then((r) => console.log('[plaid resync]', id, r)))
  await audit({ event, actorUserId: user.userId, action: 'plaid.resync', objectType: 'plaid_item', objectId: id })
  return { ok: true }
})
