import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Pitch not found', 404)
  rateLimit('rescreen', user.userId, 20, 60 * 60 * 1000)
  const { screeningId } = await screenPitch(id.data)
  await audit({ event, actorUserId: user.userId, action: 'deal.rescreen', objectType: 'pitch', objectId: id.data, detail: { screening_id: screeningId } })
  return { ok: true }
})
