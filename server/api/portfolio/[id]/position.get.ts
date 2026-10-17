// Our position in a portfolio company: holdings (cost, recorded value), the latest round from the founder's reports or
// their Finvry cap table, and what our holdings are worth on it. Also the holdings that could be linked.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const pos = await positionOf(id.data)
  const options = (await db().query("SELECT to_regclass('wealth.holdings') IS NOT NULL AS ok")).rows[0]?.ok
    ? (await db().query<{ id: string; name: string; cost: number | null }>("SELECT id, name, cost::float AS cost FROM wealth.holdings WHERE section = 'venture' ORDER BY name LIMIT 500")).rows : []
  return { ...pos, options }
})
