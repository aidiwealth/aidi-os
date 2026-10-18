// Merge customers that are the same (keeps the first one's name unless another is given).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ ids: z.array(z.string().uuid()).min(2).max(50), keep: z.string().uuid() }).safeParse(await readBody(event))
  if (!b.success || !b.data.ids.includes(b.data.keep)) throw apiError('invalid', 'Choose the customers to merge and which name to keep.')
  const olds = b.data.ids.filter((x) => x !== b.data.keep)
  await db().query(`INSERT INTO financials.customer_revenue (customer_id, month, amount) SELECT $1, month, sum(amount) FROM financials.customer_revenue WHERE customer_id = ANY($2::uuid[]) GROUP BY month
    ON CONFLICT (customer_id, month) DO UPDATE SET amount = financials.customer_revenue.amount + EXCLUDED.amount`, [b.data.keep, olds])
  await db().query('DELETE FROM financials.customers WHERE id = ANY($1::uuid[])', [olds])
  await audit({ event, actorUserId: user.userId, action: 'customers.merge', objectType: 'customer', objectId: b.data.keep, detail: { merged: olds.length } })
  return { ok: true }
})
