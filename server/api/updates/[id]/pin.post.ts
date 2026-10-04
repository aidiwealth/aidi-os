import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('invalid', 'Invalid request.')
  await db().query('UPDATE financials.updates SET pinned = NOT pinned WHERE id = $1', [id.data])
  return { ok: true }
})
