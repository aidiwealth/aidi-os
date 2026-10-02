// Update deal details: owner, round, amounts, website, one-liner.
import { z } from 'zod'
const money = z.coerce.number().int().min(0).max(100_000_000_000).nullable().optional()
const Body = z.object({
  owner_id: z.string().uuid().nullable().optional(),
  round: z.enum(['pre_seed', 'seed', 'series_a', 'series_b', 'later']).nullable().optional(),
  raise_usd: money, check_usd: money, valuation_usd: money,
  website: z.string().trim().max(500).nullable().optional(),
  one_liner: z.string().trim().max(300).nullable().optional()
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the values and try again.')
  const fields = Object.entries(b.data).filter(([, v]) => v !== undefined)
  if (!fields.length) return { ok: true }
  const sets = fields.map(([k], i) => k + ' = $' + (i + 2)).join(', ')
  const u = await db().query('UPDATE deals.deals SET ' + sets + ' WHERE id = $1', [id.data, ...fields.map(([, v]) => (v === '' ? null : v))])
  if (u.rowCount !== 1) throw apiError('not_found', 'Deal not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'pipeline.update', objectType: 'deal', objectId: id.data, detail: Object.fromEntries(fields) })
  return { ok: true }
})
