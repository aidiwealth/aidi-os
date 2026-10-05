import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ share: z.enum(['auto', 'show', 'hide']) }).safeParse(await readBody(event))
  if (!/^[0-9a-f-]{36}$/.test(id) || !b.success) throw apiError('invalid', 'Invalid request.')
  await db().query('UPDATE deals.pitches SET lp_share = $2 WHERE id = $1', [id, b.data.share])
  await audit({ event, actorUserId: user.userId, action: 'deals.lp_share', objectType: 'pitch', objectId: id, detail: { share: b.data.share } })
  return { ok: true }
})
