// Add an LP's commitment to the fund, or change its amount.
import { z } from 'zod'
const Body = z.object({ lp_id: z.string().uuid(), amount: z.coerce.number().positive().max(1e13), committed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose the LP and the amount committed.')
  if (!(await db().query('SELECT 1 FROM funds.funds WHERE id = $1', [id.data])).rowCount) throw apiError('not_found', 'Fund not found', 404)
  if (!(await db().query('SELECT 1 FROM funds.lps WHERE id = $1', [b.data.lp_id])).rowCount) throw apiError('invalid', 'Choose an LP from the register.')
  await db().query(`INSERT INTO funds.commitments (fund_id, lp_id, amount, committed_on) VALUES ($1,$2,$3, coalesce($4::date, current_date))
     ON CONFLICT (fund_id, lp_id) DO UPDATE SET amount = EXCLUDED.amount, committed_on = coalesce($4::date, funds.commitments.committed_on)`, [id.data, b.data.lp_id, b.data.amount, b.data.committed_on ?? null])
  await audit({ event, actorUserId: user.userId, action: 'funds.commitment', objectType: 'fund', objectId: id.data, detail: { lp: b.data.lp_id, amount: b.data.amount } })
  return { ok: true }
})
