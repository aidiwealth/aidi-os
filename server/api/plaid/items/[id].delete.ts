// Disconnect a bank.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const it = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ access_token_enc: string }>('SELECT access_token_enc FROM banking.plaid_items WHERE id = $1', [id])).rows[0] : undefined
  if (!it) throw apiError('not_found', 'Not found', 404)
  await plaid('/item/remove', { access_token: decryptText(it.access_token_enc) }).catch(() => {})
  await db().query('DELETE FROM banking.plaid_items WHERE id = $1', [id])
  await audit({ event, actorUserId: user.userId, action: 'plaid.disconnect', objectType: 'plaid_item', objectId: id })
  return { ok: true }
})
