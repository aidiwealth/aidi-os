// Add a portfolio company, from an Invested deal or by hand.
import { z } from 'zod'
const Body = z.object({
  name: z.string().trim().min(1).max(200),
  founder_name: z.string().trim().min(1).max(200),
  founder_email: z.string().trim().email().max(254),
  deal_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  holding_entity_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  relationship: z.enum(['investment', 'subsidiary', 'affiliate', 'managed']).default('investment')
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the company, founder name and a valid founder email.')
  const row = await one<{ id: string }>(
    `INSERT INTO portfolio.companies (deal_id, name, founder_name, founder_email, created_by, relationship, holding_entity_id)
     VALUES ($1,$2,$3,$4,$5,$6, coalesce($7::uuid, (SELECT vehicle_entity_id FROM deals.deals WHERE id = $1), core.default_vehicle())) RETURNING id`,
    [b.data.deal_id ?? null, b.data.name, b.data.founder_name, b.data.founder_email.toLowerCase(), user.userId, b.data.relationship, b.data.holding_entity_id ?? null])
  await audit({ event, actorUserId: user.userId, action: 'portfolio.add', objectType: 'company', objectId: row.id, detail: { name: b.data.name } })
  return { ok: true, id: row.id }
})
