// A visitor asks for a one-time code to open the invite-only parts of an investor page. Only emails on the company's
// list get one; anyone else is told they can ask for access.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await rateLimit('pinv_code_ip', clientIp(event), 20, 60 * 60 * 1000)
  const b = z.object({ email: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter a valid email address.')
  const p = await pageBySlug(event), email = b.data.email
  if (!(await onInviteList(p.organization_id, email))) return { invited: false }
  await rateLimit('pinv_code_email', p.organization_id + ':' + email, 5, 60 * 60 * 1000)
  const code = randomOtp()
  await asPlatform(() => db().query("INSERT INTO financials.page_invite_codes (organization_id, email, code_hash, expires_at) VALUES ($1,$2,$3, now() + interval '10 minutes')", [p.organization_id, email, sha256(code)]))
  setOrgContext(p.organization_id)
  await sendPageCode(email, (await currentOrg())!.name, code)
  return { invited: true }
})
