import { MSG_CATEGORY_KEYS } from '~/shared/message-categories'
// Rename a conversation or change its type.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ subject: z.string().trim().min(1).max(120).optional(), category: z.enum(MSG_CATEGORY_KEYS).optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const r = await db().query('UPDATE services.threads SET subject = coalesce($2, subject), category = coalesce($3, category) WHERE id = $1', [id.data, b.data.subject ?? null, b.data.category ?? null])
  if (!r.rowCount) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'services.thread_updated', objectType: 'thread', objectId: id.data, detail: b.data })
  return { ok: true }
})
