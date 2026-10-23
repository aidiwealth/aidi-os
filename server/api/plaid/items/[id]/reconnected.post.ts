// After the person signed in to their bank again (update mode): clear the problem, reload balances, and catch up.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const it = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ access_token_enc: string }>('SELECT access_token_enc FROM banking.plaid_items WHERE id = $1', [id])).rows[0] : undefined
  if (!it) throw apiError('not_found', 'Not found', 404)
  await db().query('UPDATE banking.plaid_items SET error = NULL, error_code = NULL, needs_sync = true WHERE id = $1', [id])
  await refreshItem(id, it.access_token_enc)
  inBackground('plaid-sync', () => syncPlaidItems())
  await audit({ event, actorUserId: user.userId, action: 'plaid.reconnect', objectType: 'plaid_item', objectId: id })
  return { ok: true }
})
