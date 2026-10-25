// Disconnect a bank. With ?remove=1 its payments and live balances leave Banking too; otherwise they stay as history.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const it = /^[0-9a-f-]{36}$/.test(id) ? await plaidItem(id) : undefined
  if (!it) throw apiError('not_found', 'Not found', 404)
  const remove = getQuery(event).remove === '1'
  const removed = remove ? await clearFeed(it, true) : 0
  if (remove) await removeFeedAccounts(id)
  // Even a connection whose stored token cannot be read any more can be removed here.
  await Promise.resolve().then(() => plaid('/item/remove', { access_token: decryptText(it.access_token_enc) })).catch(() => {})
  await db().query('DELETE FROM banking.plaid_items WHERE id = $1', [id])
  await syncFeedStatements().catch(() => 0)
  await audit({ event, actorUserId: user.userId, action: 'plaid.disconnect', objectType: 'plaid_item', objectId: id, detail: { removed } })
  return { ok: true, removed }
})
