// Move a deal. Invested needs the deal to be at IC with enough GP approvals and no GP rejection; Passed needs a reason.
import { z } from 'zod'
const Body = z.object({ stage: z.enum(STAGES), note: z.string().trim().max(2000).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose a stage.')
  const cur = await db().query<{ stage: Stage }>('SELECT stage FROM deals.deals WHERE id = $1', [id.data])
  const from = cur.rows[0]?.stage
  if (!from) throw apiError('not_found', 'Deal not found', 404)
  const to = b.data.stage
  if (from === to) return { ok: true }
  if (to === 'passed' && (b.data.note ?? '').length < 3) throw apiError('reason', 'Add a short reason for passing.')
  if (to === 'invested') {
    if (from !== 'ic') throw apiError('ic_first', 'Move the deal to IC first. Invested needs an IC decision.')
    const t = await icTally(id.data)
    if (t.rejections > 0) throw apiError('ic_rejected', 'A GP has voted to reject. Resolve that before marking it Invested.')
    if (t.approvals < IC_APPROVALS_REQUIRED) throw apiError('ic_approvals', 'Invested needs ' + IC_APPROVALS_REQUIRED + ' GP approvals (' + t.approvals + ' so far).')
  }
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      "UPDATE deals.deals SET stage = $2, stage_since = now(), closed_at = CASE WHEN $2 IN ('invested','passed') THEN now() ELSE NULL END WHERE id = $1",
      [id.data, to])
    await client.query('INSERT INTO deals.deal_events (deal_id, kind, body, from_stage, to_stage, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [id.data, 'stage', b.data.note || null, from, to, user.userId])
    await client.query('INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [user.userId, 'pipeline.stage', 'deal', id.data, JSON.stringify({ from, to }), getRequestIP(event, { xForwardedFor: true }) ?? null])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  return { ok: true }
})
