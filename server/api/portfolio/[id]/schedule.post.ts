// Automatic update requests for one company: off, monthly or quarterly, sent on a chosen day of the month.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ cadence: z.enum(['off', 'monthly', 'quarterly']), day: z.number().int().min(1).max(28) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose how often and a day between 1 and 28.')
  const r = await db().query('UPDATE portfolio.companies SET report_cadence = $2, report_day = $3 WHERE id = $1', [id.data, b.data.cadence, b.data.day])
  if (!r.rowCount) throw apiError('not_found', 'Company not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'portfolio.schedule', objectType: 'company', objectId: id.data, detail: b.data })
  return { ok: true, next: await upcomingRequest(id.data, b.data.cadence, b.data.day) }
})
