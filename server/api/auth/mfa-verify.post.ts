// POST /api/auth/mfa-verify { ticket, code } — second step of sign-in: authenticator code or a recovery code.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const b = z.object({ ticket: z.string().max(1000), code: z.string().trim().min(6).max(20) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter the 6-digit code from your authenticator app.')
  rateLimit('auth_mfa_ip', clientIp(event), 30, 15 * 60 * 1000)
  const t = readMfaTicket(b.data.ticket)
  if (!t) throw apiError('expired', 'This sign-in has expired. Start again with your email.', 400)
  rateLimit('auth_mfa_user', t.u, 8, 15 * 60 * 1000)
  if (!(await verifySecondFactor(t.u, b.data.code))) throw apiError('bad_code', 'That code is not right. Check your authenticator app and try again.', 400)
  await establishSession(event, t.e)
  await audit({ event, actorUserId: t.u, action: 'auth.mfa_pass', objectType: 'user', objectId: t.u })
  return { ok: true }
})
