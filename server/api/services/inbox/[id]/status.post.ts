// Close or reopen a conversation.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ status: z.enum(['open', 'closed']) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  if (b.data.status === 'closed') await db().query("UPDATE services.threads SET status = 'closed', closed_at = now(), closed_by = 'team' WHERE id = $1", [id.data])
  else await db().query("UPDATE services.threads SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = $1", [id.data])
  await audit({ event, actorUserId: user.userId, action: 'services.thread_' + b.data.status, objectType: 'thread', objectId: id.data })
  return { ok: true }
})
