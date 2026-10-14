import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const f = (await db().query('SELECT id, name, assumptions, updated_at FROM financials.forecasts WHERE id = $1', [id.data])).rows[0]
  if (!f) throw apiError('not_found', 'Not found', 404)
  return f
})
