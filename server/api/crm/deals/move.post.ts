import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), stage_id: z.string().uuid() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose investors and a stage.')
  await db().query('UPDATE crm.deals SET stage_id = $2, updated_at = now() WHERE id = ANY($1::uuid[]) AND pipeline_id = (SELECT pipeline_id FROM crm.stages WHERE id = $2)', [b.data.ids, b.data.stage_id])
  return { ok: true }
})
