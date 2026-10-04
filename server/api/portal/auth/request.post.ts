// Email a sign-in code to a client contact with portal access. The reply never says whether the email has access.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  rateLimit('portal_code_ip', clientIp(event), 8, 15 * 60 * 1000)
  const b = z.object({ email: z.string().trim().email().max(254) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter a valid email.')
  const email = b.data.email.toLowerCase()
  rateLimit('portal_code_email', email, 4, 15 * 60 * 1000)
  const p = await asPlatform(() => db().query<{ id: string; organization_id: string; name: string }>(
    'SELECT id, organization_id, name FROM services.people WHERE lower(email) = $1 AND portal_access ORDER BY last_login DESC NULLS LAST, created_at DESC LIMIT 1', [email]))
  const person = p.rows[0]
  if (person) {
    const code = randomOtp()
    await asPlatform(async () => {
      await db().query('DELETE FROM services.portal_codes WHERE person_id = $1', [person.id])
      await db().query("INSERT INTO services.portal_codes (organization_id, person_id, code_hash, expires_at) VALUES ($1,$2,$3, now() + interval '10 minutes')", [person.organization_id, person.id, sha256(person.id + ':' + code)])
    })
    setOrgContext(person.organization_id)
    try { await sendPortalCodeEmail(email, person.name, code) } catch (err) { console.error('[portal] code email failed', err) }
  }
  return { ok: true }
})
