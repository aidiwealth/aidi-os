// POST /api/auth/verify-otp { email, code } -> session cookie
import { z } from 'zod'
const Body = z.object({ email: z.string().email().max(254), code: z.string().regex(/^\d{6}$/) })
export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw apiError('invalid', 'Enter your email and the 6-digit code.')
  const email = parsed.data.email.trim().toLowerCase()
  rateLimit('auth_otp_ip', clientIp(event), 30, 15 * 60 * 1000)
  rateLimit('auth_otp_email', email, 10, 15 * 60 * 1000)
  await establishSession(event, await verifyOtp(email, parsed.data.code))
  return { ok: true }
})
