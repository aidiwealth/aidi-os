// The visitor enters their code: a cookie lets them into the board for 30 days (while they stay on its list).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await rateLimit('bverify_ip', clientIp(event), 30, 60 * 60 * 1000)
  const p = z.object({ email: z.string().trim().toLowerCase().max(254), code: z.string().trim().regex(/^\d{6}$/) }).safeParse(await readBody(event))
  if (!p.success) throw apiError('invalid', 'Enter the 6-digit code from the email.')
  const b = await boardByToken(event), { email, code } = p.data
  const row = (await asPlatform(() => db().query<{ id: string; code_hash: string; attempts: number }>('SELECT id, code_hash, attempts FROM financials.board_codes WHERE board_id = $1 AND organization_id = $2 AND email = $3 AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1', [b.id, b.organization_id, email]))).rows[0]
  if (!row || row.attempts >= 5) throw apiError('expired', 'That code has expired. Ask for a new one.', 400)
  if (!safeEqualHex(sha256(code), row.code_hash)) {
    await asPlatform(() => db().query('UPDATE financials.board_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]))
    throw apiError('wrong_code', "That code isn't right. Check the email and try again.", 400)
  }
  if (!onBoardList(b, email)) throw apiError('not_invited', 'This email is no longer on the list.', 403)
  await asPlatform(() => db().query('UPDATE financials.board_codes SET consumed_at = now() WHERE id = $1', [row.id]))
  const s = (await asPlatform(() => db().query<{ id: string }>('INSERT INTO financials.board_sessions (organization_id, board_id, email, expires_at) VALUES ($1,$2,$3, now() + make_interval(days => $4)) RETURNING id', [b.organization_id, b.id, email, BOARD_SESSION_DAYS]))).rows[0]!
  setCookie(event, boardCookie(b.id), s.id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: BOARD_SESSION_DAYS * 24 * 60 * 60 })
  return { ok: true }
})
