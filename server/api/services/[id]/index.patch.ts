// Update job details: owner, provider entity, priority, due date, fee, title, description.
import { z } from 'zod'
const Body = z.object({
  owner_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fee_usd: z.number().min(0).max(1e9).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional()
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the values and try again.')
  const fields = Object.entries(b.data).filter(([, v]) => v !== undefined)
  if (!fields.length) return { ok: true }
  const sets = fields.map(([k], i) => k + ' = $' + (i + 2)).join(', ')
  const u = await db().query('UPDATE services.jobs SET ' + sets + ', updated_at = now() WHERE id = $1', [id.data, ...fields.map(([, v]) => v)])
  if (u.rowCount !== 1) throw apiError('not_found', 'Job not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'services.job_update', objectType: 'job', objectId: id.data, detail: Object.fromEntries(fields) })
  return { ok: true }
})
