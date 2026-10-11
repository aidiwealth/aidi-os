// Switch job emails to a services client off (or back on): messages, status changes and shared files are still saved
// and visible on their job page, but no email goes out while muted.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ muted: z.boolean() }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const r = await db().query('UPDATE services.clients SET emails_muted = $2 WHERE id = $1', [id.data, b.data.muted])
  if (!r.rowCount) throw apiError('not_found', 'Client not found', 404)
  await audit({ event, actorUserId: user.userId, action: b.data.muted ? 'services.client_emails_off' : 'services.client_emails_on', objectType: 'client', objectId: id.data })
  return { ok: true, muted: b.data.muted }
})
