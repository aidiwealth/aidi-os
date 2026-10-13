// Lock (or unlock) a month: its Airbnb rows, rent and expenses can no longer change (admins).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ period: z.string().regex(/^20\d{2}-[01]\d$/), locked: z.boolean() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  if (b.data.locked) await db().query('INSERT INTO rentals.locks (period, locked_by) VALUES ($1,$2) ON CONFLICT DO NOTHING', [b.data.period, user.userId])
  else await db().query('DELETE FROM rentals.locks WHERE period = $1', [b.data.period])
  await db().query('INSERT INTO rentals.activity (event, detail) VALUES ($1,$2)', [b.data.locked ? 'Month locked' : 'Month unlocked', monthLabel(b.data.period)])
  await audit({ event, actorUserId: user.userId, action: b.data.locked ? 'rentals.month_locked' : 'rentals.month_unlocked', objectType: 'rental_month', detail: { period: b.data.period } })
  return { ok: true }
})
