// Import a sent Finvry investor update's figures and notes into a portfolio company.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ update_id: z.string().uuid() }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const r = await importFinvryUpdate(id.data, b.data.update_id, user.userId)
  await audit({ event, actorUserId: user.userId, action: 'portfolio.finvry_import', objectType: 'company', objectId: id.data, detail: { update: b.data.update_id, ...r } })
  return { ok: true, ...r }
})
