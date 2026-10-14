// Delete one of this person's conversations.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  await db().query('DELETE FROM core.ai_chats WHERE id = $1 AND user_id = $2', [id.data, user.userId])
  return { ok: true }
})
