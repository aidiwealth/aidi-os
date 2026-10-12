// Delete every message (and conversation) with this client — both sides stop seeing them, including files shared in them.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const n = (await db().query('DELETE FROM services.messages WHERE client_id = $1', [id.data])).rowCount ?? 0
  await db().query('DELETE FROM services.threads WHERE client_id = $1', [id.data])
  await audit({ event, actorUserId: user.userId, action: 'services.messages_deleted', objectType: 'client', objectId: id.data, detail: { messages: n } })
  return { ok: true, deleted: n }
})
