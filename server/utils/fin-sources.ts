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
export function qbAuthUrl(state: string, origin: string) {
  return 'https://appcenter.intuit.com/connect/oauth2?' + new URLSearchParams({ client_id: rc().quickbooksClientId, response_type: 'code', scope: 'com.intuit.quickbooks.accounting', redirect_uri: qbRedirect(origin), state }).toString()
}
async function tokenCall(body: Record<string, string>) {
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(body), signal: AbortSignal.timeout(15000) })
  const j = await res.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; x_refresh_token_expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !j.access_token) throw apiError('quickbooks_auth', 'QuickBooks sign-in failed: ' + (j.error_description ?? j.error ?? 'HTTP ' + res.status), 502)
  return j as Required<Pick<typeof j, 'access_token' | 'refresh_token' | 'expires_in' | 'x_refresh_token_expires_in'>>
}
export const qbExchange = (code: string, origin: string) => tokenCall({ grant_type: 'authorization_code', code, redirect_uri: qbRedirect(origin) })
interface Conn { id: string; realm_id: string; access_enc: string; refresh_enc: string; expires_at: string }
async function qbToken(c: Conn): Promise<string> {
  if (new Date(c.expires_at).getTime() > Date.now() + 60_000) return decryptText(c.access_enc)
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: decryptText(c.refresh_enc) })
  await db().query("UPDATE financials.connections SET access_enc = $2, refresh_enc = $3, expires_at = now() + make_interval(secs => $4), refresh_expires_at = now() + make_interval(secs => $5), updated_at = now() WHERE id = $1", [c.id, encryptText(t.access_token), encryptText(t.refresh_token), t.expires_in, t.x_refresh_token_expires_in])
  return t.access_token
}
export async function qbGet<T = any>(c: Conn, path: string): Promise<T> {
  const res = await fetch(qbApiBase() + '/v3/company/' + c.realm_id + path + (path.includes('?') ? '&' : '?') + 'minorversion=75', { headers: { authorization: 'Bearer ' + await qbToken(c), accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
  const j = await res.json().catch(() => ({})) as T & { Fault?: { Error?: { Message?: string; Detail?: string }[] } }
  if (!res.ok) throw apiError('quickbooks_error', 'QuickBooks: ' + (j.Fault?.Error?.[0]?.Detail ?? j.Fault?.Error?.[0]?.Message ?? 'HTTP ' + res.status), 502)
  return j
}
export async function qbRevoke(c: Conn) { try { await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ token: decryptText(c.refresh_enc) }), signal: AbortSignal.timeout(10000) }) } catch { /* best effort */ } }
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
