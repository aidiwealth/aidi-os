// Passwordless sign-in, following Telroi's auth-core. Invite-only: codes are only ever sent to active users.
import type { H3Event } from 'h3'

const TOKEN_TTL_SECONDS = 10 * 60
const MAX_OTP_ATTEMPTS = 5

export async function startLogin(email: string, ip: string): Promise<void> {
  const user = await db().query<{ id: string }>("SELECT id FROM core.users WHERE email = $1 AND status = 'active'", [email])
  if (user.rowCount !== 1) {
    console.warn('[auth] code requested for an address without access from ' + ip)
    return // same response either way, so the form does not reveal who has access
  }
  const token = randomToken(), otp = randomOtp()
  await db().query('UPDATE core.login_codes SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL', [email])
  await db().query(
    "INSERT INTO core.login_codes (email, token_hash, otp_hash, expires_at, created_ip) VALUES ($1,$2,$3, now() + make_interval(secs => $4), $5)",
    [email, sha256(token), sha256(otp), TOKEN_TTL_SECONDS, ip === 'unknown' ? null : ip])
  const link = useRuntimeConfig().public.appBaseUrl + '/api/auth/magic?token=' + encodeURIComponent(token)
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
  if (!safeEqualHex(sha256(code), row.otp_hash)) {
    const attempts = row.attempts + 1
    await db().query('UPDATE core.login_codes SET attempts = $2::int, consumed_at = CASE WHEN $2::int >= $3::int THEN now() ELSE NULL END WHERE id = $1',
      [row.id, attempts, MAX_OTP_ATTEMPTS])
    throw apiError(attempts >= MAX_OTP_ATTEMPTS ? 'too_many_attempts' : 'wrong_code',
      attempts >= MAX_OTP_ATTEMPTS ? 'Too many attempts. Request a new code.' : 'That code is not correct.', attempts >= MAX_OTP_ATTEMPTS ? 429 : 400)
  }
  await db().query('UPDATE core.login_codes SET consumed_at = now() WHERE id = $1', [row.id])
  return email
}

export async function establishSession(event: H3Event, email: string): Promise<void> {
  const u = await db().query<{ id: string }>("UPDATE core.users SET last_login_at = now() WHERE email = $1 AND status = 'active' RETURNING id", [email])
  if (u.rowCount !== 1) throw apiError('no_access', 'This account does not have access.', 403)
  const userId = u.rows[0]!.id
  await issueSession(event, userId, email)
  await audit({ event, actorUserId: userId, action: 'auth.sign_in', objectType: 'user', objectId: userId })
}
