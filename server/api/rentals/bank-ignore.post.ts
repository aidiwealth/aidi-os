// Mark a bank payment as not a rental cost (or undo).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = z.object({ bank_txn_id: z.string().uuid(), undo: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  if (b.data.undo) await db().query('DELETE FROM rentals.bank_ignored WHERE bank_txn_id = $1', [b.data.bank_txn_id])
  else await db().query('INSERT INTO rentals.bank_ignored (bank_txn_id, ignored_by) VALUES ($1,$2) ON CONFLICT DO NOTHING', [b.data.bank_txn_id, user.userId])
  return { ok: true }
})
