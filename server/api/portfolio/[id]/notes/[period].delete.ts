// Delete the notes (highlights, challenges, asks) for one period.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id')), p = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).safeParse(getRouterParam(event, 'period'))
  if (!id.success || !p.success) throw apiError('not_found', 'Notes not found', 404)
  const n = (await db().query('DELETE FROM portfolio.updates WHERE company_id = $1 AND period = $2', [id.data, p.data.slice(0, 7) + '-01'])).rowCount ?? 0
  await audit({ event, actorUserId: user.userId, action: 'portfolio.notes_delete', objectType: 'company', objectId: id.data, detail: { period: p.data } })
  return { ok: true, deleted: n }
})
