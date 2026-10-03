// Record what an LP paid in (for a call) or was paid (for a distribution). The call completes when every line is settled.
import { z } from 'zod'
const Body = z.object({ line_id: z.string().uuid(), paid_amount: z.coerce.number().min(0).max(1e13), paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Add the amount and date.')
  const c = (await db().query<{ status: string }>('SELECT status FROM funds.calls WHERE id = $1', [id.data])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  if (c.status !== 'sent' && c.status !== 'completed') throw apiError('state', 'Payments are recorded once the notices are sent.')
  const l = await db().query<{ amount: string }>('SELECT amount::text FROM funds.call_lines WHERE id = $2 AND call_id = $1', [id.data, b.data.line_id])
  if (!l.rows[0]) throw apiError('not_found', 'Line not found', 404)
  if (b.data.paid_amount > Number(l.rows[0].amount) + 0.005) throw apiError('invalid', 'That is more than the amount due.')
  await db().query('UPDATE funds.call_lines SET paid_amount = $2, paid_on = $3 WHERE id = $1', [b.data.line_id, b.data.paid_amount, b.data.paid_on])
  const open = (await one<{ n: number }>('SELECT count(*)::int AS n FROM funds.call_lines WHERE call_id = $1 AND paid_amount < amount', [id.data])).n
  await db().query("UPDATE funds.calls SET status = CASE WHEN $2 = 0 THEN 'completed' ELSE 'sent' END WHERE id = $1", [id.data, open])
  await audit({ event, actorUserId: user.userId, action: 'funds.payment', objectType: 'fund_call', objectId: id.data, detail: { line: b.data.line_id, amount: b.data.paid_amount } })
  return { ok: true, completed: open === 0 }
})
