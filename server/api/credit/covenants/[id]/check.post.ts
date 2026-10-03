// Record a covenant test (met, breached or waived); recurring covenants roll to the next date.
import { z } from 'zod'
const Body = z.object({ result: z.enum(['met', 'breached', 'waived']), note: z.string().trim().max(2000).optional(), document_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose the result.')
  if (b.data.result !== 'met' && (b.data.note ?? '').length < 3) throw apiError('note', 'Add a note explaining the breach or waiver.')
  const c = await db().query<{ loan_id: string; next_due: string; frequency: string; active: boolean }>("SELECT loan_id, to_char(next_due, 'YYYY-MM-DD') AS next_due, frequency, active FROM credit.covenants WHERE id = $1", [id.data])
  const cov = c.rows[0]
  if (!cov || !cov.active) throw apiError('not_found', 'Covenant not found', 404)
  const next = nextCovenantDate(cov.next_due, cov.frequency)
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query('INSERT INTO credit.covenant_checks (covenant_id, due_date, result, note, document_id, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [id.data, cov.next_due, b.data.result, b.data.note || null, b.data.document_id ?? null, user.userId])
    if (next) await client.query('UPDATE credit.covenants SET next_due = $2 WHERE id = $1', [id.data, next])
    else await client.query('UPDATE credit.covenants SET active = false WHERE id = $1', [id.data])
    await client.query('INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [user.userId, 'credit.covenant_' + b.data.result, 'loan', cov.loan_id, JSON.stringify({ covenant_id: id.data, due_date: cov.next_due }), getRequestIP(event, { xForwardedFor: true }) ?? null])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  return { ok: true, next_due: next }
})
