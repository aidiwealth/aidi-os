// POST /api/auth/request { email } -> emails a magic link and code if the address has access
import { z } from 'zod'
const Body = z.object({ email: z.string().email().max(254) })
export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw apiError('invalid', 'Enter a valid email address.')
  const email = parsed.data.email.trim().toLowerCase()
  const ip = clientIp(event)
  rateLimit('auth_request_email', email, 5, 15 * 60 * 1000)
  rateLimit('auth_request_email_day', email, 15, 24 * 60 * 60 * 1000)
  rateLimit('auth_request_ip', ip, 15, 15 * 60 * 1000)
  await startLogin(email, ip)
  return { ok: true }
})
