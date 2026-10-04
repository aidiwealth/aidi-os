import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const m = (await db().query('SELECT id, title, notes, body, updated_at FROM fundraise.memos WHERE id = $1', [id.data])).rows[0]
  if (!m) throw apiError('not_found', 'Not found', 404)
  return m
})
