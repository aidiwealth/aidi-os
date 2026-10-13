// Mark rent paid (in full or part).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ amount: z.coerce.number().min(0), paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), method: z.string().trim().max(40).optional().nullable(), note: z.string().trim().max(500).optional().nullable(), clear: z.boolean().optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Enter the amount and date paid.')
  const c = (await db().query<{ due_on: string; paid_amount: string | null }>("SELECT to_char(due_on, 'YYYY-MM-DD') AS due_on, paid_amount::text FROM rentals.rent_charges WHERE id = $1", [id.data])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  await assertUnlocked(c.due_on)
  if (b.data.clear || c.paid_amount) { if (!isRentalAdmin(user.roles)) throw apiError('forbidden', 'Only an admin can change a recorded payment.', 403) }
  if (b.data.clear) await db().query('UPDATE rentals.rent_charges SET paid_amount = NULL, paid_on = NULL, method = NULL, note = NULL WHERE id = $1', [id.data])
  else await db().query('UPDATE rentals.rent_charges SET paid_amount = $2, paid_on = $3, method = $4, note = $5 WHERE id = $1', [id.data, b.data.amount, b.data.paid_on, b.data.method || null, b.data.note || null])
  await audit({ event, actorUserId: user.userId, action: 'rentals.rent_paid', objectType: 'rental_rent', objectId: id.data, detail: { amount: b.data.amount } })
  return { ok: true }
})
