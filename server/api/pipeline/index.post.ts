// Add a deal by hand (one you sourced outside the pitch form).
import { z } from 'zod'
const money = z.coerce.number().int().min(0).max(100_000_000_000).optional()
const Body = z.object({
  company: z.string().trim().min(1).max(200),
  one_liner: z.string().trim().max(300).optional(),
  website: z.string().trim().max(500).optional(),
  round: z.enum(['pre_seed', 'seed', 'series_a', 'series_b', 'later']).optional(),
  raise_usd: money,
  source: z.enum(['referral', 'outbound', 'network', 'other']).default('other'),
  stage: z.enum(['screening', 'first_call', 'diligence']).default('screening'),
  vehicle_entity_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined))
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add at least the company name.')
  const d = b.data
  const row = await one<{ id: string }>(
    `INSERT INTO deals.deals (company, one_liner, website, round, raise_usd, source, stage, owner_id, created_by, vehicle_entity_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8, coalesce($9::uuid, (SELECT id FROM core.entities WHERE name = 'Aidi Ventures Fund I'))) RETURNING id`,
    [d.company, d.one_liner || null, d.website || null, d.round ?? null, d.raise_usd ?? null, d.source, d.stage, user.userId, d.vehicle_entity_id ?? null])
  await audit({ event, actorUserId: user.userId, action: 'pipeline.create', objectType: 'deal', objectId: row.id, detail: { company: d.company, source: d.source } })
  return { ok: true, id: row.id }
})
