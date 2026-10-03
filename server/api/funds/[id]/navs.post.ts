// Record the fund's net asset value at a date (usually quarter end).
import { z } from 'zod'
const Body = z.object({ as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), nav: z.coerce.number().min(0).max(1e13), note: z.string().trim().max(500).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Add the date and the net asset value.')
  if (!(await db().query('SELECT 1 FROM funds.funds WHERE id = $1', [id.data])).rowCount) throw apiError('not_found', 'Fund not found', 404)
  await db().query('INSERT INTO funds.navs (fund_id, as_of, nav, note, created_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (fund_id, as_of) DO UPDATE SET nav = EXCLUDED.nav, note = EXCLUDED.note',
    [id.data, b.data.as_of, b.data.nav, b.data.note || null, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'funds.nav', objectType: 'fund', objectId: id.data, detail: { as_of: b.data.as_of, nav: b.data.nav } })
  return { ok: true }
})
