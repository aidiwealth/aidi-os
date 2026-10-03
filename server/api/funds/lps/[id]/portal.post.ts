// Email the LP a fresh portal link (it replaces any earlier link).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'LP not found', 404)
  const lp = (await db().query<{ name: string; email: string | null }>('SELECT name, email FROM funds.lps WHERE id = $1', [id.data])).rows[0]
  if (!lp) throw apiError('not_found', 'LP not found', 404)
  if (!lp.email) throw apiError('invalid', 'Add the LP\'s email first.')
  const link = await issueLpLink(id.data)
  await sendLpPortalEmail(lp.email, lp.name, link)
  await audit({ event, actorUserId: user.userId, action: 'funds.portal_link', objectType: 'lp', objectId: id.data })
  return { ok: true }
})
