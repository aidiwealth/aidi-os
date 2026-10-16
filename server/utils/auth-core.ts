import { AIDI_ORG_SQL } from '~/server/utils/session'
// Passwordless sign-in, following Telroi's auth-core. Invite-only: codes are only ever sent to active users.
import type { H3Event } from 'h3'

const TOKEN_TTL_SECONDS = 10 * 60
const MAX_OTP_ATTEMPTS = 5

export async function startLogin(email: string, ip: string): Promise<void> {
  // Codes go only to active people with an active workspace (or platform staff)
  const user = await asPlatform(() => db().query<{ id: string }>(
    `SELECT u.id FROM core.users u WHERE u.email = $1 AND u.status = 'active'
        AND (EXISTS (SELECT 1 FROM core.memberships m JOIN core.organizations o ON o.id = m.organization_id WHERE m.user_id = u.id AND m.status = 'active' AND o.status = ANY($2::text[]))
             OR EXISTS (SELECT 1 FROM core.platform_staff p WHERE p.user_id = u.id))`, [email, LIVE_ORG_STATUSES]))
  if (user.rowCount !== 1) {
    console.warn('[auth] code requested for an address without access from ' + ip)
    return // same response either way, so the form does not reveal who has access
  }
  const token = randomToken(), otp = randomOtp()
  await db().query('UPDATE core.login_codes SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL', [email])
  await db().query(
    "INSERT INTO core.login_codes (email, token_hash, otp_hash, expires_at, created_ip) VALUES ($1,$2,$3, now() + make_interval(secs => $4), $5)",
    [email, sha256(token), sha256(otp), TOKEN_TTL_SECONDS, ip === 'unknown' ? null : ip])
  const link = '{{APP_URL}}' + '/api/auth/magic?token=' + encodeURIComponent(token)
  await sendLoginEmail(email, link, otp)
}

export async function verifyToken(token: string): Promise<string> {
  const r = await db().query<{ id: string; email: string }>(
    'UPDATE core.login_codes SET consumed_at = now() WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING id, email',
    [sha256(token)])
  if (r.rowCount !== 1) throw apiError('invalid_link', 'This sign-in link is invalid or has expired. Request a new code.', 400)
  return r.rows[0]!.email
}

export async function verifyOtp(email: string, code: string): Promise<string> {
  const r = await db().query<{ id: string; otp_hash: string; attempts: number }>(
    'SELECT id, otp_hash, attempts FROM core.login_codes WHERE email = $1 AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1',
    [email])
  const row = r.rows[0]
  if (!row) throw apiError('no_code', 'No active code. Request a new one.', 400)
  // Count the attempt atomically before comparing, so parallel guesses cannot share one attempt.
  const n = (await db().query<{ attempts: number }>('UPDATE core.login_codes SET attempts = attempts + 1 WHERE id = $1 AND consumed_at IS NULL RETURNING attempts', [row.id])).rows[0]?.attempts
  if (!n || n > MAX_OTP_ATTEMPTS) { await db().query('UPDATE core.login_codes SET consumed_at = now() WHERE id = $1', [row.id]); throw apiError('too_many_attempts', 'Too many attempts. Request a new code.', 429) }
  if (!safeEqualHex(sha256(code), row.otp_hash)) {
    const attempts = n
    if (attempts >= MAX_OTP_ATTEMPTS) await db().query('UPDATE core.login_codes SET consumed_at = now() WHERE id = $1', [row.id])
    throw apiError(attempts >= MAX_OTP_ATTEMPTS ? 'too_many_attempts' : 'wrong_code',
      attempts >= MAX_OTP_ATTEMPTS ? 'Too many attempts. Request a new code.' : 'That code is not correct.', attempts >= MAX_OTP_ATTEMPTS ? 429 : 400)
  }
  await db().query('UPDATE core.login_codes SET consumed_at = now() WHERE id = $1', [row.id])
  return email
}

export async function establishSession(event: H3Event, email: string): Promise<void> {
  const u = await db().query<{ id: string; last_org_id: string | null }>("UPDATE core.users SET last_login_at = now() WHERE email = $1 AND status = 'active' RETURNING id, last_org_id", [email])
  if (u.rowCount !== 1) throw apiError('no_access', 'This account does not have access.', 403)
  const userId = u.rows[0]!.id
  // Open the workspace they used last, else their first one. On app.finvry.com only Finvry workspaces count: Aidi OS
  // people sign in at app.theaidigroup.com.
  const onFinvry = hostBrand(event) === 'finvry'
  const pick = await asPlatform(() => db().query<{ org: string | null; platform: boolean }>(
    `SELECT (SELECT m.organization_id FROM core.memberships m JOIN core.organizations o ON o.id = m.organization_id
              WHERE m.user_id = $1 AND m.status = 'active' AND o.status = ANY($3::text[]) ${onFinvry ? 'AND NOT ' + AIDI_ORG_SQL : ''}
              ORDER BY (m.organization_id = $2) DESC NULLS LAST, m.created_at LIMIT 1) AS org,
            EXISTS (SELECT 1 FROM core.platform_staff p WHERE p.user_id = $1) AS platform`, [userId, u.rows[0]!.last_org_id, LIVE_ORG_STATUSES]))
  const orgId = pick.rows[0]?.org ?? null
  if (!orgId && onFinvry) throw apiError('aidi_only', 'This account signs in at app.theaidigroup.com, not on Finvry.', 403)
  if (!orgId && !pick.rows[0]?.platform) throw apiError('no_access', 'This account does not have access to a workspace.', 403)
  await issueSession(event, userId, email, orgId)
  event.context.orgId = orgId
  await audit({ event, actorUserId: userId, action: 'auth.sign_in', objectType: 'user', objectId: userId })
}
