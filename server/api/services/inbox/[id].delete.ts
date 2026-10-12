// Delete a conversation and all its messages (both sides stop seeing it, including files shared in it).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const t = (await db().query<{ subject: string; client_id: string }>('SELECT subject, client_id FROM services.threads WHERE id = $1', [id.data])).rows[0]
  if (!t) throw apiError('not_found', 'Not found', 404)
  await db().query('DELETE FROM services.messages WHERE thread_id = $1', [id.data])
  await db().query('DELETE FROM services.threads WHERE id = $1', [id.data])
  await audit({ event, actorUserId: user.userId, action: 'services.thread_deleted', objectType: 'thread', objectId: id.data, detail: { subject: t.subject, client_id: t.client_id } })
  return { ok: true }
})
