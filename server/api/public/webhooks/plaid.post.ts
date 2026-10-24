// Notices from Plaid about live bank connections. Each one is verified (Plaid signs a JWT over the request body with a
// key fetched from Plaid by its id; ES256; at most five minutes old) before anything is done. New or changed
// transactions: the connection is marked to sync and synced after the response. Problems (the bank needs the person to
// sign in again, access ended, consent about to expire): recorded on the connection so Banking shows Reconnect.
const keyById = async (kid: string) => { const r = await plaid<{ key: JsonWebKey & { expired_at?: number | null } }>('/webhook_verification_key/get', { key_id: kid }); return r.key.expired_at ? null : r.key }
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, 'utf8')) ?? '', jwt = getRequestHeader(event, 'plaid-verification') ?? ''
  if (!jwt || !(await plaidWebhookVerified(raw, jwt, keyById).catch(() => false))) throw apiError('forbidden', 'Forbidden', 403)
  const b = JSON.parse(raw) as { webhook_type?: string; webhook_code?: string; item_id?: string; error?: { error_code?: string; error_message?: string } | null }
  if (!b.item_id) return { ok: true }
  // Which workspace the connection belongs to: looked up across workspaces, then everything runs as that workspace.
  const it = (await asPlatform(() => db().query<{ id: string; organization_id: string }>('SELECT id, organization_id FROM banking.plaid_items WHERE item_id = $1', [b.item_id]))).rows[0]
  if (!it) return { ok: true }
  setOrgContext(it.organization_id)
  await db().query('UPDATE banking.plaid_items SET last_webhook_at = now() WHERE id = $1', [it.id])
  const code = b.webhook_code ?? '', type = b.webhook_type ?? ''
  if (type === 'TRANSACTIONS' && ['SYNC_UPDATES_AVAILABLE', 'DEFAULT_UPDATE', 'INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'TRANSACTIONS_REMOVED'].includes(code)) {
    await db().query('UPDATE banking.plaid_items SET needs_sync = true WHERE id = $1', [it.id])
    inBackground('plaid-sync', async () => { await syncPlaidItems(); await fixOwnTransfers(); await fixCardPayments(); await pairTransfers() })
  } else if (type === 'ITEM' && ['ERROR', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT', 'USER_PERMISSION_REVOKED', 'USER_ACCOUNT_REVOKED'].includes(code)) {
    const msg = code === 'PENDING_EXPIRATION' || code === 'PENDING_DISCONNECT' ? 'Access to this bank ends soon: reconnect to keep it updating.' : code === 'ERROR' && b.error?.error_code === 'ITEM_LOGIN_REQUIRED' ? 'The bank needs you to sign in again: reconnect.' : code.startsWith('USER_') ? 'Access to this bank was withdrawn: reconnect or disconnect it.' : 'The bank connection has a problem: reconnect.'
    await db().query('UPDATE banking.plaid_items SET error = $2, error_code = $3 WHERE id = $1', [it.id, msg, (b.error?.error_code ?? code).slice(0, 80)])
  } else if (type === 'ITEM' && code === 'LOGIN_REPAIRED') {
    await db().query('UPDATE banking.plaid_items SET error = NULL, error_code = NULL, needs_sync = true WHERE id = $1', [it.id])
  }
  return { ok: true }
})
