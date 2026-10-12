// Delete a meeting's minutes.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'admin')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const r = await db().query('DELETE FROM core.meeting_minutes WHERE id = $1', [id.data])
  if (!r.rowCount) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'meetings.deleted', objectType: 'meeting', objectId: id.data })
  return { ok: true }
})
