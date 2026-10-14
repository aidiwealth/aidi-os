// One of this person's conversations, to continue it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const c = (await db().query('SELECT id, title, messages, updated_at FROM core.ai_chats WHERE id = $1 AND user_id = $2', [id.data, user.userId])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  return c
})
