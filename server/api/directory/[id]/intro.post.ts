// Request an introduction: emails the professional with the requester's details and message, copies the requester, logs it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ message: z.string().trim().min(10).max(2000), consent: z.literal(true) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Write a short note about what you need, and agree to share your contact details.')
  const pro = (await asPlatform(() => db().query<{ name: string; email: string; firm: string | null }>('SELECT name, email, firm FROM platform.professionals WHERE id = $1 AND active', [id.data]))).rows[0]
  if (!pro) throw apiError('not_found', 'Not found', 404)
  const recent = await asPlatform(() => db().query("SELECT 1 FROM platform.introductions WHERE user_id = $1 AND created_at > now() - interval '1 day' HAVING count(*) >= 10", [user.userId]))
  if (recent.rowCount) throw apiError('rate', 'You have requested many introductions today. Please try again tomorrow.', 429)
  const me = await one<{ name: string }>('SELECT p.full_name AS name FROM core.users u JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId])
  const org = await currentOrg()
  await sendIntroEmails({ pro: pro.name, proEmail: pro.email, firm: pro.firm, who: me.name, whoEmail: user.email, org: org?.name ?? '', message: b.data.message })
  await asPlatform(() => db().query('INSERT INTO platform.introductions (professional_id, organization_id, user_id, message) VALUES ($1,$2,$3,$4)', [id.data, user.orgId, user.userId, b.data.message]))
  return { ok: true }
})
