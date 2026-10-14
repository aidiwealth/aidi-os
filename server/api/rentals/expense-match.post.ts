// Match a logged expense to a bank payment (reconciled), or unmatch it.
import { z } from 'zod'
const Body = z.object({ id: z.string().uuid(), bank_txn_id: z.string().uuid().nullable() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const e = (await db().query<{ spent_on: string; created_by: string | null; bank_txn_id: string | null }>("SELECT to_char(spent_on, 'YYYY-MM-DD') AS spent_on, created_by, bank_txn_id FROM rentals.expenses WHERE id = $1", [b.data.id])).rows[0]
  if (!e) throw apiError('not_found', 'Expense not found', 404)
  if (e.bank_txn_id && !e.created_by) throw apiError('state', 'This expense comes from the bank statement itself.', 409)
  await assertUnlocked(e.spent_on)
  await db().query('UPDATE rentals.expenses SET bank_txn_id = $2 WHERE id = $1', [b.data.id, b.data.bank_txn_id]).catch((err) => { if ((err as { code?: string }).code === '23505') throw apiError('duplicate', 'That bank payment is already matched to another expense.', 409); throw err })
  await audit({ event, actorUserId: user.userId, action: b.data.bank_txn_id ? 'rentals.expense_matched' : 'rentals.expense_unmatched', objectType: 'rental_expense', objectId: b.data.id })
  return { ok: true }
})
