// Correct a recurring service's dates: when it started (the next renewal is worked out from it) or the next renewal
// date directly; or pause / cancel it. Moves the wallet renewal and the compliance calendar together.
import { z } from 'zod'
const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), started_on: D.optional().or(z.literal('').transform(() => undefined)), next_date: D.optional().or(z.literal('').transform(() => undefined)), status: z.enum(['active', 'suspended', 'cancelled']).optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Enter valid dates.')
  const today = new Date().toISOString().slice(0, 10)
  if (b.data.started_on && b.data.started_on > today) throw apiError('invalid', 'The start date cannot be in the future.')
  if (b.data.next_date && b.data.next_date < today) throw apiError('invalid', 'The next renewal must be today or later — past renewals are not charged.')
  const r = await setRenewal(id.data, b.data.code, b.data)
  await audit({ event, actorUserId: user.userId, action: 'services.renewal_dates', objectType: 'client', objectId: id.data, detail: { ...b.data, next: r.next } })
  return { ok: true, ...r }
})
