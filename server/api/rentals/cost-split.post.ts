// Save how shared rental costs are split (GPs and admins): category bases and unit size weights.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ categories: z.array(z.object({ code: z.string().regex(/^[a-z0-9_]{2,40}$/), split: z.enum(['weight', 'nights', 'equal']) })).max(100).default([]),
    units: z.array(z.object({ id: z.string().uuid(), weight: z.coerce.number().min(0).max(1000) })).max(200).default([]) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the weights (0 or more).')
  for (const c of b.data.categories) await db().query('UPDATE rentals.expense_categories SET split = $2 WHERE code = $1', [c.code, c.split])
  for (const u of b.data.units) await db().query('UPDATE rentals.units SET cost_weight = $2 WHERE id = $1', [u.id, u.weight])
  await audit({ event, actorUserId: user.userId, action: 'rentals.cost_split_saved', objectType: 'rental_settings', detail: b.data })
  return { ok: true }
})
