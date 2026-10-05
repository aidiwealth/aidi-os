// Plaid: link tokens, token exchange and balances. Sandbox or production from NUXT_PLAID_ENV.
export function plaidOn(): boolean { const c = useRuntimeConfig(); return !!(c.plaidClientId && c.plaidSecret) }
export async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const c = useRuntimeConfig()
  if (!plaidOn()) throw apiError('plaid_off', 'Bank connections are not set up yet.', 503)
  const env = (c.plaidEnv as string) === 'production' ? 'production' : 'sandbox'
  const r = await fetch('https://' + env + '.plaid.com' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: c.plaidClientId, secret: c.plaidSecret, ...body }), signal: AbortSignal.timeout(20000) })
  const j = await r.json() as T & { error_message?: string; error_code?: string }
  if (!r.ok) { console.error('[plaid]', path, j.error_code, j.error_message); throw apiError('plaid', 'The bank connection returned an error: ' + (j.error_message ?? r.status), 502) }
  return j
}
interface PAcct { account_id: string; name: string; official_name?: string; mask?: string; type?: string; subtype?: string; balances: { current: number | null; available: number | null; iso_currency_code: string | null; unofficial_currency_code: string | null } }
export async function refreshItem(itemRowId: string, accessTokenEnc: string): Promise<void> {
  try {
    const j = await plaid<{ accounts: PAcct[] }>('/accounts/balance/get', { access_token: decryptText(accessTokenEnc) })
    for (const a of j.accounts) await db().query(`INSERT INTO banking.plaid_accounts (item_id, account_id, name, mask, type, subtype, currency, current, available, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT (account_id) DO UPDATE SET name = EXCLUDED.name, current = EXCLUDED.current, available = EXCLUDED.available, currency = EXCLUDED.currency, updated_at = now()`,
      [itemRowId, a.account_id, (a.official_name || a.name).slice(0, 200), a.mask ?? null, a.type ?? null, a.subtype ?? null, a.balances.iso_currency_code || a.balances.unofficial_currency_code || 'USD', a.balances.current, a.balances.available])
    await db().query('UPDATE banking.plaid_items SET error = NULL WHERE id = $1', [itemRowId])
  } catch (err) { await db().query('UPDATE banking.plaid_items SET error = $2 WHERE id = $1', [itemRowId, String((err as Error).message).slice(0, 300)]) }
}
