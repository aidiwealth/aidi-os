import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const s = (await db().query("SELECT *, amount::float AS amount, valuation_cap::float AS valuation_cap, discount::float AS discount, to_char(safe_date, 'YYYY-MM-DD') AS safe_date FROM fundraise.safes WHERE id = $1", [id.data])).rows[0]
  if (!s) throw apiError('not_found', 'Not found', 404)
  return s
})
