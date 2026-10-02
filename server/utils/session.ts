// Signed session cookie (jose, HS256) carrying the id of a row in core.sessions, as on Telroi.
// Unlike Telroi, checks fail closed: if the session cannot be recorded or confirmed, there is no session.
import { SignJWT, jwtVerify } from 'jose'
import type { H3Event } from 'h3'

const COOKIE = 'aidi_os_session'
const MAX_AGE = 60 * 60 * 12 // 12 hours

export interface SessionUser { userId: string; email: string; roles: string[] }

function secret(): Uint8Array {
  const s = useRuntimeConfig().jwtSecret
  if (!s || s.length < 32) {
    if (!import.meta.dev) throw new Error('NUXT_JWT_SECRET is missing or shorter than 32 characters')
    return new TextEncoder().encode('dev-only-secret-dev-only-secret-dev-only')
  }
  return new TextEncoder().encode(s)
}

export async function issueSession(event: H3Event, userId: string, email: string): Promise<void> {
  const row = await one<{ id: string }>(
    "INSERT INTO core.sessions (user_id, expires_at, ip, user_agent) VALUES ($1, now() + make_interval(secs => $2), $3, $4) RETURNING id",
    [userId, MAX_AGE, getRequestIP(event, { xForwardedFor: true }) ?? null, (getHeader(event, 'user-agent') ?? '').slice(0, 300) || null]
  )
  const jwt = await new SignJWT({ sid: row.id, uid: userId, email })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(MAX_AGE + 's').sign(secret())
  setCookie(event, COOKIE, jwt, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: MAX_AGE })
}

export async function readSession(event: H3Event): Promise<SessionUser | null> {
  const token = getCookie(event, COOKIE)
  if (!token) return null
  let sid: string
  try {
    const { payload } = await jwtVerify(token, secret())
    if (typeof payload.sid !== 'string') return null
    sid = payload.sid
  } catch { return null } // bad or expired signature: simply not signed in
  const r = await db().query<{ user_id: string; email: string; roles: string[] }>(
    `SELECT s.user_id, u.email, coalesce(array_agg(DISTINCT ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), '{}') AS roles
       FROM core.sessions s JOIN core.users u ON u.id = s.user_id
       LEFT JOIN core.user_roles ur ON ur.user_id = u.id
      WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'
      GROUP BY s.user_id, u.email`, [sid])
  const row = r.rows[0]
  return row ? { userId: row.user_id, email: row.email, roles: row.roles } : null
}

export async function endSession(event: H3Event): Promise<void> {
  const token = getCookie(event, COOKIE)
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret())
      if (typeof payload.sid === 'string') {
        await db().query("UPDATE core.sessions SET revoked_at = now(), revoked_reason = 'signed out' WHERE id = $1 AND revoked_at IS NULL", [payload.sid])
      }
    } catch (err) { if (!(err instanceof Error && /JWT|JWS|signature|exp/i.test(err.message))) throw err }
  }
  deleteCookie(event, COOKIE, { path: '/' })
}

export async function revokeSessions(userId: string, reason: string): Promise<void> {
  await db().query('UPDATE core.sessions SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, reason])
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const s = event.context.user as SessionUser | undefined ?? await readSession(event)
  if (!s) throw apiError('unauthorized', 'Sign in required', 401)
  return s
}

export async function requireRole(event: H3Event, ...roles: string[]): Promise<SessionUser> {
  const s = await requireUser(event)
  if (!s.roles.includes('admin') && !roles.some((r) => s.roles.includes(r))) throw apiError('forbidden', 'You do not have access to this.', 403)
  return s
}
