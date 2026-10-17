// Save the founder's row order for a cap table (holder names, plus the new investors and the option pool).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  const b = z.object({ ct: z.string().uuid().optional(), order: z.array(z.string().max(300)).max(500) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Could not save the order.')
  const ct = await capTableId(b.data.ct)
  await db().query('UPDATE equity.captables SET row_order = $2 WHERE id = $1', [ct, JSON.stringify(b.data.order)])
  return { ok: true }
})
