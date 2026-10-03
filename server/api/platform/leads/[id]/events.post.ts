// Log activity on a lead, or move it to another stage (lost needs a reason).
import { z } from 'zod'
import { LEAD_STAGES } from '~/server/utils/sales'
const Body = z.object({ kind: z.enum(['note', 'call', 'email', 'meeting', 'stage']), body: z.string().trim().max(5000).optional(), stage: z.enum(LEAD_STAGES).optional() })
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid update.')
  const d = b.data
  if (d.kind !== 'stage' && !d.body) throw apiError('invalid', 'Write the note.')
  if (d.kind === 'stage' && !d.stage) throw apiError('invalid', 'Choose a stage.')
  if (d.stage === 'lost' && (d.body ?? '').length < 3) throw apiError('invalid', 'Add the reason it was lost.')
  await asPlatform(async () => {
    const l = await db().query<{ stage: string }>('SELECT stage FROM platform.leads WHERE id = $1', [id.data])
    if (!l.rows[0]) throw apiError('not_found', 'Lead not found', 404)
    if (d.kind === 'stage') {
      if (d.stage === l.rows[0].stage) return
      await db().query('UPDATE platform.leads SET stage = $2, stage_changed_at = now(), updated_at = now(), lost_reason = CASE WHEN $2 = \'lost\' THEN $3 ELSE NULL END WHERE id = $1', [id.data, d.stage, d.body ?? null])
      await db().query('INSERT INTO platform.lead_events (lead_id, kind, body, from_stage, to_stage, created_by) VALUES ($1, \'stage\', $2, $3, $4, $5)', [id.data, d.body || null, l.rows[0].stage, d.stage, staff.userId])
    } else {
      await db().query('INSERT INTO platform.lead_events (lead_id, kind, body, created_by) VALUES ($1,$2,$3,$4)', [id.data, d.kind, d.body, staff.userId])
      await db().query('UPDATE platform.leads SET updated_at = now() WHERE id = $1', [id.data])
    }
  })
  return { ok: true }
})
