// Mark the current due date done (with an optional note and proof document). Recurring obligations roll to the next date.
import { z } from 'zod'
const Body = z.object({
  completed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(2000).optional(),
  document_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined))
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the date and try again.')
  const o = await db().query<{ next_due: string; recurrence: string; active: boolean; entity_id: string }>(
    "SELECT to_char(next_due, 'YYYY-MM-DD') AS next_due, recurrence, active, entity_id FROM compliance.obligations WHERE id = $1", [id.data])
  const ob = o.rows[0]
  if (!ob) throw apiError('not_found', 'Not found', 404)
  if (!ob.active) throw apiError('inactive', 'This obligation is no longer active.')
  if (b.data.document_id) {
    const doc = await db().query<{ sensitivity: Sensitivity }>('SELECT sensitivity FROM core.documents WHERE id = $1', [b.data.document_id])
    if (!doc.rows[0] || !canSee(user.roles, doc.rows[0].sensitivity)) throw apiError('not_found', 'Document not found', 404)
  }
  const next = rollForward(ob.next_due, ob.recurrence)
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query('INSERT INTO compliance.completions (obligation_id, due_date, completed_on, note, document_id, completed_by) VALUES ($1,$2,coalesce($3::date, current_date),$4,$5,$6)',
      [id.data, ob.next_due, b.data.completed_on ?? null, b.data.note || null, b.data.document_id ?? null, user.userId])
    if (next) await client.query('UPDATE compliance.obligations SET next_due = $2 WHERE id = $1', [id.data, next])
    else await client.query('UPDATE compliance.obligations SET active = false WHERE id = $1', [id.data])
    await client.query('INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, entity_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [user.userId, 'compliance.complete', 'obligation', id.data, ob.entity_id, JSON.stringify({ due_date: ob.next_due, next_due: next }), getRequestIP(event, { xForwardedFor: true }) ?? null])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  return { ok: true, next_due: next }
})
