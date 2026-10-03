import { z } from 'zod'
const Body = z.object({ received_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.coerce.number().positive().max(1e12), note: z.string().trim().max(1000).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Enter the date received and the amount.')
  const l = await db().query<{ status: string; disbursed_on: string }>("SELECT status, to_char(disbursed_on, 'YYYY-MM-DD') AS disbursed_on FROM credit.loans WHERE id = $1", [id.data])
  if (!l.rows[0]) throw apiError('not_found', 'Loan not found', 404)
  if (b.data.received_on < l.rows[0].disbursed_on) throw apiError('invalid', 'A repayment cannot be before the loan was disbursed.')
  if (b.data.received_on > new Date().toISOString().slice(0, 10)) throw apiError('invalid', 'The date received cannot be in the future.')
  const row = await one<{ id: string }>('INSERT INTO credit.repayments (loan_id, received_on, amount, note, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [id.data, b.data.received_on, b.data.amount, b.data.note || null, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'credit.repayment', objectType: 'loan', objectId: id.data, detail: { amount: b.data.amount, received_on: b.data.received_on } })
  return { ok: true, id: row.id }
})
