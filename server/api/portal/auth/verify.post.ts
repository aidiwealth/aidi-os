// Check the code and start a portal session. Five wrong tries and the code is spent.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  rateLimit('portal_verify', clientIp(event), 20, 15 * 60 * 1000)
  const b = z.object({ email: z.string().trim().email().max(254), code: z.string().trim().regex(/^[0-9]{6}$/) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter the 6-digit code from the email.')
  const r = await asPlatform(() => db().query<{ id: string; person_id: string; organization_id: string; code_hash: string; attempts: number }>(
    `SELECT c.id, c.person_id, c.organization_id, c.code_hash, c.attempts FROM services.portal_codes c JOIN services.people p ON p.id = c.person_id
      WHERE lower(p.email) = $1 AND p.portal_access AND c.expires_at > now() ORDER BY c.created_at DESC LIMIT 1`, [b.data.email.toLowerCase()]))
  const c = r.rows[0]
  if (!c || c.attempts >= 5) throw apiError('bad_code', 'That code is not valid or has expired. Ask for a new one.', 400)
  if (!safeEqualHex(c.code_hash, sha256(c.person_id + ':' + b.data.code))) {
    await asPlatform(() => db().query('UPDATE services.portal_codes SET attempts = attempts + 1 WHERE id = $1', [c.id]))
    throw apiError('bad_code', 'That code is not right. Check the email and try again.', 400)
  }
  await asPlatform(() => db().query('DELETE FROM services.portal_codes WHERE person_id = $1', [c.person_id]))
  await startPortalSession(event, c.person_id, c.organization_id)
  return { ok: true }
})
