// Financial data sources. Google Sheets: a share link ("Anyone with the link can view") is downloaded as Excel and
// read like an upload. QuickBooks Online: OAuth 2.0, then Profit & Loss, Balance Sheet and Cash Flow reports for
// the period are turned into text and mapped to standard lines; the user checks every figure before saving.
import { createHmac, timingSafeEqual } from 'node:crypto'
const rc = () => useRuntimeConfig() as unknown as Record<string, string>
export const qbConfigured = () => !!(rc().quickbooksClientId && rc().quickbooksClientSecret)
const qbApiBase = () => (rc().quickbooksEnv === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com')
const basic = () => 'Basic ' + Buffer.from(rc().quickbooksClientId + ':' + rc().quickbooksClientSecret).toString('base64')
export function publicOrigin(event: Parameters<typeof getRequestURL>[0]) { const u = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }); return (u.hostname === 'localhost' || u.hostname === '127.0.0.1' ? u.protocol : 'https:') + '//' + u.host }
export const qbRedirect = (origin: string) => origin.replace(/\/$/, '') + '/api/public/integrations/quickbooks/callback'
export function signState(o: Record<string, string | number>): string { const p = Buffer.from(JSON.stringify(o)).toString('base64url'); return p + '.' + createHmac('sha256', rc().jwtSecret).update('qb:' + p).digest('base64url').slice(0, 32) }
export function readState(s: string): Record<string, any> | null {
  const [p, sig] = s.split('.'); if (!p || !sig) return null
  const want = createHmac('sha256', rc().jwtSecret).update('qb:' + p).digest('base64url').slice(0, 32)
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  const o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); return o.exp > Date.now() ? o : null
}
// Intuit's OpenID discovery document gives the current OAuth endpoints; cached for a day, with known fallbacks.
let disco: { at: number; d: { authorization_endpoint: string; token_endpoint: string; revocation_endpoint: string } } | null = null
async function qbEndpoints() {
  if (disco && Date.now() - disco.at < 86_400_000) return disco.d
  const fallback = { authorization_endpoint: 'https://appcenter.intuit.com/connect/oauth2', token_endpoint: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', revocation_endpoint: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke' }
  try {
    const url = rc().quickbooksEnv === 'production' ? 'https://developer.api.intuit.com/.well-known/openid_configuration' : 'https://developer.api.intuit.com/.well-known/openid_sandbox_configuration'
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    const j = await r.json() as Partial<typeof fallback>
    disco = { at: Date.now(), d: { authorization_endpoint: j.authorization_endpoint || fallback.authorization_endpoint, token_endpoint: j.token_endpoint || fallback.token_endpoint, revocation_endpoint: j.revocation_endpoint || fallback.revocation_endpoint } }
  } catch { disco = { at: Date.now() - 86_000_000, d: fallback } }
  return disco.d
}
export async function qbAuthUrl(state: string, origin: string) {
  return (await qbEndpoints()).authorization_endpoint + '?' + new URLSearchParams({ client_id: rc().quickbooksClientId, response_type: 'code', scope: 'com.intuit.quickbooks.accounting', redirect_uri: qbRedirect(origin), state }).toString()
}
// Token requests: one retry for network or server errors; never retried for invalid_grant or other 4xx answers.
async function tokenCall(body: Record<string, string>) {
  const ep = (await qbEndpoints()).token_endpoint
  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null
    try { res = await fetch(ep, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(body), signal: AbortSignal.timeout(15000) }) } catch { res = null }
    if ((!res || res.status >= 500) && attempt < 2) { await new Promise((r) => setTimeout(r, 1500)); continue }
    if (!res) throw apiError('quickbooks_unavailable', 'QuickBooks could not be reached. Please try again in a moment.', 503)
    const j = await res.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; x_refresh_token_expires_in?: number; error?: string; error_description?: string }
    if (!res.ok || !j.access_token) console.error('[quickbooks]', JSON.stringify({ op: 'token:' + body.grant_type, status: res.status, tid: res.headers.get('intuit_tid'), error: j.error ?? null }))
    if (j.error === 'invalid_grant') throw apiError('quickbooks_reconnect', 'Your QuickBooks connection has expired or was revoked. Reconnect QuickBooks to continue.', 401)
    if (!res.ok || !j.access_token) throw apiError('quickbooks_auth', 'QuickBooks sign-in failed: ' + (j.error_description ?? j.error ?? 'HTTP ' + res.status), 502)
    return j as Required<Pick<typeof j, 'access_token' | 'refresh_token' | 'expires_in' | 'x_refresh_token_expires_in'>>
  }
}
export const qbExchange = (code: string, origin: string) => tokenCall({ grant_type: 'authorization_code', code, redirect_uri: qbRedirect(origin) })
interface Conn { id: string; realm_id: string; access_enc: string; refresh_enc: string; expires_at: string }
// Every QuickBooks error is logged (server logs) and the last 20 are kept on the connection, with Intuit's
// intuit_tid so Intuit support can trace a request.
async function logQb(c: Conn | null, e: { op: string; status?: number; tid?: string | null; message: string }) {
  const row = { at: new Date().toISOString(), ...e }
  console.error('[quickbooks]', JSON.stringify({ realm: c?.realm_id ?? null, ...row }))
  if (c) await db().query("UPDATE financials.connections SET settings = jsonb_set(settings, '{errors}', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(coalesce(settings->'errors', '[]'::jsonb) || jsonb_build_array($2::jsonb)) AS x ORDER BY x->>'at' DESC LIMIT 20) s)) WHERE id = $1", [c.id, JSON.stringify(row)]).catch(() => {})
}
async function markReconnect(c: Conn) { await db().query("UPDATE financials.connections SET settings = settings || '{\"needs_reconnect\": true}'::jsonb, updated_at = now() WHERE id = $1", [c.id]).catch(() => {}) }
// Access tokens last an hour: refreshed when within a minute of expiry (or when QuickBooks rejects one); each refresh
// stores the new refresh token. An expired or revoked refresh token marks the connection as needing reconnect.
async function qbToken(c: Conn, force = false): Promise<string> {
  if (!force && new Date(c.expires_at).getTime() > Date.now() + 60_000) return decryptText(c.access_enc)
  let t
  try { t = await tokenCall({ grant_type: 'refresh_token', refresh_token: decryptText(c.refresh_enc) }) }
  catch (err) { if ((err as { data?: { error?: { code?: string } } }).data?.error?.code === 'quickbooks_reconnect' || (err as { statusCode?: number }).statusCode === 401) await markReconnect(c); throw err }
  await db().query("UPDATE financials.connections SET access_enc = $2, refresh_enc = $3, expires_at = now() + make_interval(secs => $4), refresh_expires_at = now() + make_interval(secs => $5), settings = settings - 'needs_reconnect', updated_at = now() WHERE id = $1", [c.id, encryptText(t.access_token), encryptText(t.refresh_token), t.expires_in, t.x_refresh_token_expires_in])
  c.access_enc = encryptText(t.access_token); c.expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString()
  return t.access_token
}
export async function qbGet<T = any>(c: Conn, path: string): Promise<T> {
  const url = qbApiBase() + '/v3/company/' + c.realm_id + path + (path.includes('?') ? '&' : '?') + 'minorversion=75'
  let res = await fetch(url, { headers: { authorization: 'Bearer ' + await qbToken(c), accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
  if (res.status === 401) res = await fetch(url, { headers: { authorization: 'Bearer ' + await qbToken(c, true), accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
  const tid = res.headers.get('intuit_tid')
  if (res.status === 401) { await logQb(c, { op: 'GET ' + path.split('?')[0], status: 401, tid, message: 'Unauthorized after refresh' }); await markReconnect(c); throw apiError('quickbooks_reconnect', 'QuickBooks no longer accepts this connection. Reconnect QuickBooks to continue.', 401) }
  const j = await res.json().catch(() => ({})) as T & { Fault?: { type?: string; Error?: { Message?: string; Detail?: string; code?: string }[] } }
  if (!res.ok || j.Fault) {
    const m = j.Fault?.Error?.[0]?.Detail ?? j.Fault?.Error?.[0]?.Message ?? 'HTTP ' + res.status
    await logQb(c, { op: 'GET ' + path.split('?')[0], status: res.status, tid, message: (j.Fault?.type ? j.Fault.type + ': ' : '') + m })
    throw apiError('quickbooks_error', 'QuickBooks: ' + m + (tid ? ' (reference ' + tid + ')' : ''), 502)
  }
  return j
}
export async function qbRevoke(c: Conn) { try { await fetch((await qbEndpoints()).revocation_endpoint, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ token: decryptText(c.refresh_enc) }), signal: AbortSignal.timeout(10000) }) } catch { /* best effort */ } }
export async function qbConn(subject: string): Promise<(Conn & { company_name: string | null }) | null> {
  return (await db().query<Conn & { company_name: string | null }>("SELECT id, realm_id, access_enc, refresh_enc, expires_at, company_name FROM financials.connections WHERE subject = $1 AND provider = 'quickbooks'", [subject])).rows[0] ?? null
}
// A QuickBooks report as readable lines: "Section > Account | amount".
export function reportText(r: any, title: string): string {
  const out: string[] = ['## ' + title + (r?.Header?.StartPeriod ? ' (' + r.Header.StartPeriod + ' to ' + r.Header.EndPeriod + ')' : r?.Header?.EndPeriod ? ' (as of ' + r.Header.EndPeriod + ')' : '') + (r?.Header?.Currency ? ' · ' + r.Header.Currency : '')]
  const walk = (rows: any[], path: string[]) => {
    for (const row of rows ?? []) {
      if (row.type === 'Section' || row.Rows) {
        const h = row.Header?.ColData?.[0]?.value
        walk(row.Rows?.Row ?? [], h ? [...path, h] : path)
        const s = row.Summary?.ColData; if (s) out.push([...path, s[0]?.value ?? 'Total'].join(' > ') + ' | ' + s.slice(1).map((c: any) => c.value).join(' | '))
      } else if (row.ColData) out.push([...path, row.ColData[0]?.value ?? ''].join(' > ') + ' | ' + row.ColData.slice(1).map((c: any) => c.value).join(' | '))
    }
  }
  walk(r?.Rows?.Row ?? [], [])
  return out.join('\n')
}
export function periodRange(type: string, end: string): { start: string; end: string } {
  const d = new Date(end + 'T00:00:00Z'), y = d.getUTCFullYear(), m = d.getUTCMonth()
  const start = type === 'year' ? new Date(Date.UTC(y, 0, 1)) : type === 'quarter' ? new Date(Date.UTC(y, m - 2, 1)) : new Date(Date.UTC(y, m, 1))
  return { start: start.toISOString().slice(0, 10), end }
}
// Google Sheets share link → Excel bytes.
export async function fetchGoogleSheet(url: string): Promise<Buffer> {
  const m = /docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(url)
  if (!m) throw apiError('invalid', 'Paste the full Google Sheets link (docs.google.com/spreadsheets/d/…).')
  const res = await fetch('https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=xlsx', { redirect: 'follow', signal: AbortSignal.timeout(20000) })
  const ct = res.headers.get('content-type') ?? ''
  if (!res.ok || ct.includes('text/html')) throw apiError('gsheet_private', 'We could not open that sheet. In Google Sheets, click Share and set "Anyone with the link" to Viewer, then try again.', 400)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 15 * 1024 * 1024) throw apiError('too_large', 'That sheet is too large (15 MB maximum).', 413)
  return buf
}
