// Replace a pipeline's stages (names, colours, kinds, order). A stage with investors in it cannot be removed.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ pipeline_id: z.string().uuid(), stages: z.array(z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(60), color: z.enum(['grey', 'blue', 'purple', 'teal', 'amber', 'green', 'red']), kind: z.enum(['open', 'committed', 'won', 'lost']) })).min(1).max(20) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the stages.')
  const keep = b.data.stages.filter((s) => s.id).map((s) => s.id!)
  const used = await db().query<{ name: string }>('SELECT s.name FROM crm.stages s WHERE s.pipeline_id = $1 AND NOT (s.id = ANY($2::uuid[])) AND EXISTS (SELECT 1 FROM crm.deals d WHERE d.stage_id = s.id)', [b.data.pipeline_id, keep])
  if (used.rows.length) throw apiError('in_use', 'Move investors out of "' + used.rows[0]!.name + '" before removing it.', 409)
  await db().query('DELETE FROM crm.stages WHERE pipeline_id = $1 AND NOT (id = ANY($2::uuid[]))', [b.data.pipeline_id, keep])
  for (const [i, s] of b.data.stages.entries()) {
    if (s.id) await db().query('UPDATE crm.stages SET name = $2, color = $3, kind = $4, sort = $5 WHERE id = $1 AND pipeline_id = $6', [s.id, s.name, s.color, s.kind, i, b.data.pipeline_id])
    else await db().query('INSERT INTO crm.stages (pipeline_id, name, color, kind, sort) VALUES ($1,$2,$3,$4,$5)', [b.data.pipeline_id, s.name, s.color, s.kind, i])
  }
  return { ok: true }
})
