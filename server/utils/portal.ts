// Client portal sessions: an opaque random token in an httpOnly cookie, only its hash stored. Separate from team sessions.
import type { H3Event } from 'h3'
const COOKIE = 'aidi_client'
const DAYS = 30
export interface PortalUser { sessionId: string; personId: string; clientId: string; orgId: string; name: string; email: string; client: string }

export async function startPortalSession(event: H3Event, personId: string, orgId: string): Promise<void> {
  const token = randomToken()
  await asPlatform(() => db().query("INSERT INTO services.portal_sessions (organization_id, person_id, token_hash, expires_at, ip, user_agent) VALUES ($1,$2,$3, now() + make_interval(days => $4), $5, $6)",
    [orgId, personId, sha256(token), DAYS, clientIp(event), (getHeader(event, 'user-agent') ?? '').slice(0, 300) || null]))
  await asPlatform(() => db().query('UPDATE services.people SET last_login = now() WHERE id = $1', [personId]))
  setCookie(event, COOKIE, token, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: DAYS * 86400 })
}

export async function requirePortal(event: H3Event): Promise<PortalUser> {
  const token = getCookie(event, COOKIE)
  if (!token || token.length < 30) throw apiError('signed_out', 'Please sign in.', 401)
  const r = await asPlatform(() => db().query<PortalUser & { seen_old: boolean }>(
    `SELECT s.id AS "sessionId", p.id AS "personId", p.client_id AS "clientId", s.organization_id AS "orgId", p.name, p.email, c.name AS client, (s.last_seen < now() - interval '5 minutes') AS seen_old
       FROM services.portal_sessions s JOIN services.people p ON p.id = s.person_id AND p.portal_access JOIN services.clients c ON c.id = p.client_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha256(token)]))
  const u = r.rows[0]
  if (!u) { deleteCookie(event, COOKIE, { path: '/' }); throw apiError('signed_out', 'Please sign in.', 401) }
  setOrgContext(u.orgId)
  if (!(await enabledModules()).has('services')) throw apiError('signed_out', 'The client portal is not available.', 401)
  if (u.seen_old) await asPlatform(() => db().query('UPDATE services.portal_sessions SET last_seen = now() WHERE id = $1', [u.sessionId]))
  return u
}

export async function endPortalSession(event: H3Event): Promise<void> {
  const token = getCookie(event, COOKIE)
  if (token) await asPlatform(() => db().query('DELETE FROM services.portal_sessions WHERE token_hash = $1', [sha256(token)]))
  deleteCookie(event, COOKIE, { path: '/' })
}

export async function portalUrl(path = ''): Promise<string> { return (await appUrl()) + '/client' + path }

// Who on a client should hear about something: people with portal access, else the client's main email.
export async function clientRecipients(clientId: string): Promise<{ emails: string[]; portal: boolean }> {
  const p = await db().query<{ email: string }>('SELECT DISTINCT lower(email) AS email FROM services.people WHERE client_id = $1 AND portal_access AND email IS NOT NULL', [clientId])
  if (p.rows.length) return { emails: p.rows.map((r) => r.email), portal: true }
  const c = await db().query<{ email: string }>('SELECT email FROM services.clients WHERE id = $1', [clientId])
  return { emails: c.rows.map((r) => r.email), portal: false }
}
