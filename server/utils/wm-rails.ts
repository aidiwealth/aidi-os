// Provider clients. Every call is blocked unless the provider is switched on for the client's country in Wealth
// settings and its keys are set.
const rc = () => useRuntimeConfig() as unknown as Record<string, string>
export const alpacaReady = () => !!(rc().alpacaClientId && rc().alpacaClientSecret)
export const fincraReady = () => !!rc().fincraApiKey
export const bushaReady = () => !!rc().bushaApiKey
async function call<T>(name: string, url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) })
  const text = await res.text(); let j: any = {}; try { j = text ? JSON.parse(text) : {} } catch { j = { message: text.slice(0, 200) } }
  if (!res.ok) throw apiError(name.toLowerCase() + '_error', name + ': ' + (j.message ?? j.errors?.[0]?.detail ?? j.error ?? ('HTTP ' + res.status)), 502)
  return j as T
}
// Alpaca Broker API (US). Client-credentials sign-in: the Client ID and Secret are exchanged for a 15-minute token,
// reused until it expires. Base URL: NUXT_ALPACA_BASE_URL (https://broker-api.sandbox.alpaca.markets for testing).
let alpacaToken: { token: string; exp: number } | null = null
const alpacaBase = () => (rc().alpacaBaseUrl || 'https://broker-api.sandbox.alpaca.markets').replace(/\/$/, '')
async function alpacaAuth(): Promise<string> {
  if (alpacaToken && alpacaToken.exp > Date.now() + 30_000) return alpacaToken.token
  const authx = alpacaBase().includes('sandbox') ? 'https://authx.sandbox.alpaca.markets' : 'https://authx.alpaca.markets'
  const res = await fetch(authx + '/v1/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: rc().alpacaClientId, client_secret: rc().alpacaClientSecret }), signal: AbortSignal.timeout(15000) })
  const j = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string; message?: string }
  if (!res.ok || !j.access_token) throw apiError('alpaca_error', 'Alpaca sign-in failed: ' + (j.error_description ?? j.message ?? 'HTTP ' + res.status), 502)
  alpacaToken = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 900) * 1000 }
  return j.access_token
}
export async function alpaca<T = any>(path: string, method = 'GET', body?: unknown) {
  return call<T>('Alpaca', alpacaBase() + path, { method, headers: { authorization: 'Bearer ' + await alpacaAuth(), 'content-type': 'application/json', accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined })
}
// Fincra: virtual accounts (NGN with BVN, instant; USD in the client's name, reviewed by Fincra). Base URL:
// NUXT_FINCRA_BASE_URL (sandbox https://sandboxapi.fincra.com, live https://api.fincra.com).
export function fincra<T = any>(path: string, method = 'GET', body?: unknown) {
  return call<T>('Fincra', (rc().fincraBaseUrl || 'https://sandboxapi.fincra.com').replace(/\/$/, '') + path, { method, headers: { 'api-key': rc().fincraApiKey, 'content-type': 'application/json', accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined })
}
// Busha (Nigeria crypto): quotes and trades on the firm's Busha business account.
export function busha<T = any>(path: string, method = 'GET', body?: unknown) {
  return call<T>('Busha', (rc().bushaBaseUrl || 'https://api.busha.co') + path, { method, headers: { authorization: 'Bearer ' + rc().bushaApiKey, 'content-type': 'application/json', accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined })
}
export async function railsFor(clientId: string) {
  const c = (await db().query<{ id: string; name: string; country: 'US' | 'NG'; model: string; email: string | null; phone: string | null; contact_name: string | null; bvn_enc: string | null; kyc_detail: Record<string, unknown> }>('SELECT id, name, country, model, email, phone, contact_name, bvn_enc, kyc_detail FROM wm.clients WHERE id = $1', [clientId])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  const cfg = (await wmSettings())[c.country]
  return { c, cfg, alpaca: c.country === 'US' && cfg.alpaca && alpacaReady(), fincra: cfg.fincra && fincraReady(), busha: c.country === 'NG' && cfg.busha && bushaReady(), savings: cfg.savings && c.model === 'self_directed' }
}
export async function providerRow(clientId: string, provider: string) { return (await db().query<{ id: string; external_id: string | null; status: string | null; detail: Record<string, any> }>('SELECT id, external_id, status, detail FROM wm.provider_accounts WHERE client_id = $1 AND provider = $2', [clientId, provider])).rows[0] ?? null }
export async function saveProvider(clientId: string, provider: string, externalId: string | null, status: string | null, detail: Record<string, unknown>) {
  await db().query('INSERT INTO wm.provider_accounts (client_id, provider, external_id, status, detail) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (client_id, provider) DO UPDATE SET external_id = coalesce(EXCLUDED.external_id, wm.provider_accounts.external_id), status = coalesce(EXCLUDED.status, wm.provider_accounts.status), detail = wm.provider_accounts.detail || EXCLUDED.detail, updated_at = now()', [clientId, provider, externalId, status, JSON.stringify(detail)])
}
// Everything the investing screens show for a client.
export async function investView(clientId: string) {
  const r = await railsFor(clientId)
  const out: Record<string, any> = { country: r.c.country, enabled: { alpaca: r.alpaca, fincra: r.fincra, busha: r.busha, savings: r.savings }, switched: { alpaca: r.c.country === 'US' && r.cfg.alpaca, fincra: r.cfg.fincra, busha: r.c.country === 'NG' && r.cfg.busha } }
  if (r.alpaca) {
    const a = await providerRow(clientId, 'alpaca')
    out.alpaca = { account: a }
    if (a?.external_id) {
      try {
        const acct = await alpaca(`/v1/accounts/${a.external_id}`); if (acct.status && acct.status !== a.status) await saveProvider(clientId, 'alpaca', null, acct.status, {})
        out.alpaca.status = acct.status
        out.alpaca.trading = await alpaca(`/v1/trading/accounts/${a.external_id}/account`)
        out.alpaca.positions = await alpaca(`/v1/trading/accounts/${a.external_id}/positions`)
        out.alpaca.orders = await alpaca(`/v1/trading/accounts/${a.external_id}/orders?status=all&limit=20`)
        out.alpaca.banks = await alpaca(`/v1/accounts/${a.external_id}/ach_relationships`)
        out.alpaca.transfers = await alpaca(`/v1/accounts/${a.external_id}/transfers?limit=10`)
      } catch (err) { out.alpaca.error = (err as { data?: { error?: { message?: string } }; message?: string }).data?.error?.message ?? (err as Error).message }
    }
  }
  if (r.fincra) {
    const vas = (await db().query<{ currency: string; status: string; account: Record<string, any>; reason: string | null }>('SELECT currency, status, account, reason FROM wm.virtual_accounts WHERE client_id = $1 ORDER BY currency DESC', [clientId])).rows
    const led = (await db().query<{ currency: string; bal: string; pending: string }>("SELECT currency, coalesce(sum(CASE WHEN status = 'confirmed' THEN (CASE WHEN kind IN ('withdrawal','fee') THEN -amount ELSE amount END) END), 0)::text AS bal, coalesce(sum(CASE WHEN status = 'requested' THEN amount END), 0)::text AS pending FROM wm.wallet_txns WHERE client_id = $1 GROUP BY currency", [clientId])).rows
    const txns = (await db().query("SELECT id, currency, kind, amount::float AS amount, status, reference, detail, created_at FROM wm.wallet_txns WHERE client_id = $1 ORDER BY created_at DESC LIMIT 30", [clientId])).rows
    out.fincra = { accounts: vas, balances: Object.fromEntries(led.map((l) => [l.currency, { balance: Number(l.bal), pending: Number(l.pending) }])), txns, currencies: r.c.country === 'NG' ? ['NGN', 'USD'] : ['USD'] }
  }
  if (r.busha) out.busha = { account: await providerRow(clientId, 'busha') }
  if (r.savings || (await db().query('SELECT 1 FROM wm.savings_plans WHERE client_id = $1', [clientId])).rowCount) out.savings = await savingsView(clientId)
  return out
}
export async function savingsView(clientId: string) {
  const plans = (await db().query<{ id: string; name: string; currency: string; rate: string; target: string | null; monthly: string | null; provider: string; vendor: string | null; started_on: string; matures_on: string | null; status: string; certificate_doc_id: string | null }>(
    "SELECT id, name, currency, rate::text, target::text, monthly::text, provider, vendor, to_char(started_on, 'YYYY-MM-DD') AS started_on, to_char(matures_on, 'YYYY-MM-DD') AS matures_on, status, certificate_doc_id FROM wm.savings_plans WHERE client_id = $1 ORDER BY created_at", [clientId])).rows
  const out = []
  for (const p of plans) {
    const t = (await db().query<{ id: string; kind: string; amount: string; status: string; txn_date: string; note: string | null }>("SELECT id, kind, amount::text, status, to_char(txn_date, 'YYYY-MM-DD') AS txn_date, note FROM wm.savings_txns WHERE plan_id = $1 ORDER BY txn_date DESC, created_at DESC LIMIT 100", [p.id])).rows
    const conf = t.filter((x) => x.status === 'confirmed'), sum = (k: string) => conf.filter((x) => x.kind === k).reduce((a, x) => a + Number(x.amount), 0)
    out.push({ ...p, rate: Number(p.rate), target: p.target ? Number(p.target) : null, monthly: p.monthly ? Number(p.monthly) : null, balance: Math.round((sum('deposit') + sum('interest') - sum('withdrawal')) * 100) / 100, interest: Math.round(sum('interest') * 100) / 100, txns: t.map((x) => ({ ...x, amount: Number(x.amount) })) })
  }
  return out
}
// Monthly interest on each active plan: balance × rate ÷ 12, once per month.
export async function accrueInterest(period: string) {
  const plans = (await asPlatform(() => db().query<{ id: string; organization_id: string; rate: string }>("SELECT id, organization_id, rate::text FROM wm.savings_plans WHERE status = 'active'"))).rows
  let n = 0
  for (const p of plans) {
    const bal = Number((await asPlatform(() => db().query<{ b: string }>("SELECT coalesce(sum(CASE WHEN kind = 'withdrawal' THEN -amount ELSE amount END), 0)::text AS b FROM wm.savings_txns WHERE plan_id = $1 AND status = 'confirmed'", [p.id]))).rows[0]?.b ?? 0)
    const amt = Math.round(bal * Number(p.rate) / 100 / 12 * 100) / 100
    if (amt > 0) { const r = await asPlatform(() => db().query("INSERT INTO wm.savings_txns (organization_id, plan_id, kind, amount, period, note) VALUES ($1,$2,'interest',$3,$4,'Monthly interest') ON CONFLICT DO NOTHING", [p.organization_id, p.id, amt, period])); n += r.rowCount ?? 0 }
  }
  return n
}
