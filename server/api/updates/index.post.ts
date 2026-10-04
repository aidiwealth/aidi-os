// Start an update for a month or quarter.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ period_type: z.enum(['month', 'quarter']), period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the period.')
  const org = (await currentOrg())!
  const r = await one<{ id: string }>('INSERT INTO financials.updates (title, period_type, period_end, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [org.name + ': ' + updateLabel(b.data.period_type, b.data.period_end) + ' update', b.data.period_type, b.data.period_end, user.userId])
  return { ok: true, id: r.id }
})
