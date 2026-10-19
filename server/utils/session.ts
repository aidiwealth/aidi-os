// Signed session cookie (jose, HS256) carrying the id of a row in core.sessions, as on Telroi.
// Each session acts for one workspace; roles are that workspace's roles. Checks fail closed.
import { SignJWT, jwtVerify } from 'jose'
import type { H3Event } from 'h3'

const COOKIE = 'aidi_os_session'
const MAX_AGE = 60 * 60 * 12 // 12 hours

// support: set when Aidi staff opened this account with "Log in as" (who, whether changes are allowed, when it ends).
export interface SupportAccess { by: string; byName: string; canEdit: boolean; until: string; id: string }
export interface SessionUser { sessionId: string; userId: string; email: string; roles: string[]; orgId: string | null; platform: boolean; aidiOrg?: boolean; support?: SupportAccess | null }
// Aidi OS workspaces (the internal plan, or a workspace branded Aidi) open only at app.theaidigroup.com, never on Finvry.
// Never NULL: a workspace with no brand set is a Finvry one (without coalesce, NOT (NULL OR false) is NULL and the
// workspace silently drops out of the user's list on Finvry: no company, the wrong menu).
export const AIDI_ORG_SQL = "(coalesce(o.settings->>'brand', '') = 'aidi' OR coalesce(o.plan_code, '') = 'internal')"
export const RETURN_COOKIE = 'aidi_os_return'

function secret(): Uint8Array {
  const s = useRuntimeConfig().jwtSecret
  if (!s || s.length < 32) {
    if (!import.meta.dev) throw new Error('NUXT_JWT_SECRET is missing or shorter than 32 characters')
    return new TextEncoder().encode('dev-only-secret-dev-only-secret-dev-only')
  }
  return new TextEncoder().encode(s)
}

export async function issueSession(event: H3Event, userId: string, email: string, orgId: string | null): Promise<void> {
  const sid = await createSessionRow(event, userId, orgId)
  setCookie(event, COOKIE, await sessionJwt(sid, userId, email), { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: MAX_AGE })
}
async function createSessionRow(event: H3Event, userId: string, orgId: string | null): Promise<string> {
  return (await one<{ id: string }>(
    "INSERT INTO core.sessions (user_id, organization_id, expires_at, ip, user_agent) VALUES ($1, $2, now() + make_interval(secs => $3), $4, $5) RETURNING id",
    [userId, orgId, MAX_AGE, ipOrNull(event) ?? null, (getHeader(event, 'user-agent') ?? '').slice(0, 300) || null])).id
}
async function sessionJwt(sid: string, userId: string, email: string): Promise<string> {
  return new SignJWT({ sid, uid: userId, email }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(MAX_AGE + 's').sign(secret())
}
// Hand a new session to the other product's address (app.finvry.com <-> app.theaidigroup.com): cookies cannot cross
// domains, so the session row is created here and a one-minute, single-use token carries it over.
export const RETURN_URL_COOKIE = 'aidi_os_return_url'
export async function sessionHandoff(event: H3Event, userId: string, email: string, orgId: string | null, to: 'aidi' | 'finvry'): Promise<{ sid: string; token: string }> {
  const sid = await createSessionRow(event, userId, orgId)
  // The token names the address it is for, so it cannot be replayed on the other product's address.
  const token = await new SignJWT({ h_sid: sid, uid: userId, email, to }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('60s').sign(secret())
  return { sid, token }
}
export async function acceptHandoff(event: H3Event, token: string): Promise<boolean> {
  let p: { h_sid?: unknown; uid?: unknown; email?: unknown; to?: unknown }
  try { p = (await jwtVerify(token, secret())).payload as typeof p } catch { return false }
  if (typeof p.h_sid !== 'string' || typeof p.uid !== 'string' || typeof p.email !== 'string') return false
  if (p.to !== hostBrand(event)) return false
  // Single use across every instance: the first acceptance marks the session row.
  const ok = (await asPlatform(() => db().query('UPDATE core.sessions SET handoff_used_at = now() WHERE id = $1 AND user_id = $2 AND handoff_used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING 1', [p.h_sid, p.uid]))).rowCount
  if (!ok) return false
  setCookie(event, COOKIE, await sessionJwt(p.h_sid, p.uid, p.email), { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: MAX_AGE })
  return true
}

// Sessions are looked up on every request; keep each one for 10 seconds to save a database round trip.
const sessionCache = new Map<string, { at: number; v: SessionUser | null }>()
export function forgetSessions(match?: (v: SessionUser | null, sid: string) => boolean) { if (!match) { sessionCache.clear(); return } for (const [k, e] of sessionCache) if (match(e.v, k)) sessionCache.delete(k) }
export async function readSession(event: H3Event): Promise<SessionUser | null> {
  const token = getCookie(event, COOKIE)
  if (!token) return null
  let sid: string
  try {
    const { payload } = await jwtVerify(token, secret())
    if (typeof payload.sid !== 'string') return null
    sid = payload.sid
  } catch { return null } // bad or expired signature: simply not signed in
  const onFinvry = hostBrand(event) === 'finvry'
  const hit = sessionCache.get(sid)
  if (hit && Date.now() - hit.at < 10_000) return hit.v && onFinvry && hit.v.aidiOrg ? null : hit.v
  if (sessionCache.size > 5000) sessionCache.clear()
  const r = await asPlatform(() => db().query<{ user_id: string; email: string; org_id: string | null; org_ok: boolean; roles: string[]; platform: boolean; aidi_org: boolean; imp_id: string | null; imp_by: string | null; imp_name: string | null; imp_edit: boolean | null; imp_until: string | null; imp_live: boolean | null; legacy_imp: boolean }>(
    `SELECT s.user_id, u.email, s.organization_id AS org_id, coalesce(${AIDI_ORG_SQL}, false) AS aidi_org,
            coalesce(o.status = ANY($2::text[]) AND m.status = 'active', false) AS org_ok,
            coalesce((SELECT array_agg(DISTINCT CASE WHEN ur.role_code = 'admin' AND ur.scope_entity_id IS NOT NULL THEN 'gp' ELSE ur.role_code END) FROM core.user_roles ur WHERE ur.user_id = u.id AND ur.organization_id = s.organization_id), '{}') AS roles,
            EXISTS (SELECT 1 FROM core.platform_staff ps WHERE ps.user_id = u.id) AS platform,
            i.id AS imp_id, su.email AS imp_by, sp.full_name AS imp_name, i.can_edit AS imp_edit, i.expires_at AS imp_until,
            (i.ended_at IS NULL AND i.expires_at > now()) AS imp_live, (s.impersonated_by IS NOT NULL AND s.impersonation_id IS NULL) AS legacy_imp
       FROM core.sessions s JOIN core.users u ON u.id = s.user_id
       LEFT JOIN core.impersonations i ON i.id = s.impersonation_id
       LEFT JOIN core.users su ON su.id = i.staff_user_id LEFT JOIN core.people sp ON sp.id = su.person_id
       LEFT JOIN core.organizations o ON o.id = s.organization_id
       LEFT JOIN core.memberships m ON m.organization_id = s.organization_id AND m.user_id = u.id
      WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`, [sid, LIVE_ORG_STATUSES]))
  const row = r.rows[0]
  // A support session ends when its record ends (ended from the console or the banner, or time is up). Older support
  // sessions without a record are not honoured any more.
  if (!row || (row.imp_id && !row.imp_live) || row.legacy_imp) { sessionCache.set(sid, { at: Date.now(), v: null }); return null }
  const orgId = row.org_ok ? row.org_id : null
  const support: SupportAccess | null = row.imp_id ? { id: row.imp_id, by: row.imp_by ?? '', byName: row.imp_name ?? row.imp_by ?? 'Finvry support', canEdit: !!row.imp_edit, until: new Date(row.imp_until!).toISOString() } : null
  // Acting as someone never carries console rights, whoever that person is.
  const v = { sessionId: sid, userId: row.user_id, email: row.email, roles: orgId ? row.roles : [], orgId, platform: row.platform && !support, aidiOrg: row.aidi_org, support }
  sessionCache.set(sid, { at: Date.now(), v })
  return onFinvry && v.aidiOrg ? null : v
}

export async function endSession(event: H3Event): Promise<void> {
  const token = getCookie(event, COOKIE)
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret())
      if (typeof payload.sid === 'string') {
        await db().query("UPDATE core.sessions SET revoked_at = now(), revoked_reason = 'signed out' WHERE id = $1 AND revoked_at IS NULL", [payload.sid])
        sessionCache.delete(payload.sid)
      }
    } catch (err) { if (!(err instanceof Error && /JWT|JWS|signature|exp/i.test(err.message))) throw err }
  }
  deleteCookie(event, COOKIE, { path: '/' })
}

// Sign someone out: everywhere, or only of one workspace.
export async function revokeSessions(userId: string, reason: string, orgId?: string | null): Promise<void> {
  forgetSessions((v) => v?.userId === userId)
  if (orgId) await db().query('UPDATE core.sessions SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND organization_id = $3 AND revoked_at IS NULL', [userId, reason, orgId])
  else await db().query('UPDATE core.sessions SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, reason])
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const s = event.context.user as SessionUser | undefined ?? await readSession(event)
  if (!s) throw apiError('unauthorized', 'Sign in required', 401)
  return s
}

export async function requireRole(event: H3Event, ...roles: string[]): Promise<SessionUser> {
  const s = await requireUser(event)
  if (!s.orgId) throw apiError('no_workspace', 'Choose a workspace first.', 403)
  if (!s.roles.includes('admin') && !roles.some((r) => s.roles.includes(r))) throw apiError('forbidden', 'You do not have access to this.', 403)
  return s
}
