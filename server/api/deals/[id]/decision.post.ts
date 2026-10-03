import { z } from 'zod'
const Body = z.object({ decision: z.enum(['advance', 'hold', 'decline']), note: z.string().trim().min(3).max(2000) })
const STATUS = { advance: 'advancing', hold: 'on_hold', decline: 'declined' } as const
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Pitch not found', 404)
  const body = Body.safeParse(await readBody(event))
  if (!body.success) throw apiError('invalid', 'Choose a decision and add a short note (at least 3 characters).')
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    const u = await client.query('UPDATE deals.pitches SET status = $2 WHERE id = $1', [id.data, STATUS[body.data.decision]])
    if (u.rowCount !== 1) throw apiError('not_found', 'Pitch not found', 404)
    await client.query('INSERT INTO deals.decisions (pitch_id, decision, note, decided_by) VALUES ($1,$2,$3,$4)', [id.data, body.data.decision, body.data.note, user.userId])
    if (body.data.decision === 'advance') {
      await client.query(
        `INSERT INTO deals.deals (pitch_id, company, one_liner, website, round, raise_usd, source, stage, owner_id, created_by, vehicle_entity_id)
         SELECT id, company, one_liner, website, stage, raising_usd, 'pitch_form', 'first_call', $2, $2, core.default_vehicle() FROM deals.pitches WHERE id = $1
         ON CONFLICT (pitch_id) DO NOTHING`, [id.data, user.userId])
    }
    await client.query(
      'INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [user.userId, 'deal.decision', 'pitch', id.data, JSON.stringify({ decision: body.data.decision }), getRequestIP(event, { xForwardedFor: true }) ?? null])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return { ok: true }
})
