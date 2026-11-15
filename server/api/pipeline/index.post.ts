// Add a deal by hand (one you sourced outside the pitch form), with as much about the company as is known. Fields AI
// filled and nobody has checked yet are kept in ai_unchecked, with the pages it used.
import { z } from 'zod'
const money = z.coerce.number().int().min(0).max(100_000_000_000).optional()
const Body = z.object({
  company: z.string().trim().min(1).max(200),
  ...ProfileFields,
  round: z.enum(['pre_seed', 'seed', 'series_a', 'series_b', 'later']).optional(),
  raise_usd: money, valuation_usd: money,
  source: z.enum(['referral', 'outbound', 'network', 'other']).default('other'),
  stage: z.enum(['screening', 'first_call', 'diligence']).default('screening'),
  vehicle_entity_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  ai_unchecked: z.array(z.enum(AI_KEYS)).max(30).default([]),
  sources: Sources.default([])
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', b.error.issues[0]?.path[0] === 'company' ? 'Add at least the company name.' : 'Check ' + String(b.error.issues[0]?.path[0] ?? 'the details').replace(/_/g, ' ') + ' and try again.')
  const d = b.data
  await assertFund(d.vehicle_entity_id)
  const row = await one<{ id: string }>(
    `INSERT INTO deals.deals (company, one_liner, website, round, raise_usd, valuation_usd, source, stage, owner_id, created_by, vehicle_entity_id,
       description, sector, country, city, founded, business_model, team_size, linkedin, founders, lead_investor, investors, traction, deck_url, referred_by, ai_unchecked, ai_sources, ai_looked_up_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9, coalesce($10::uuid, core.default_vehicle()), $11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23,$24,$25,$26::jsonb, CASE WHEN jsonb_array_length($26::jsonb) > 0 OR cardinality($25::text[]) > 0 THEN now() END) RETURNING id`,
    [d.company, d.one_liner, d.website, d.round ?? null, d.raise_usd ?? null, d.valuation_usd ?? null, d.source, d.stage, user.userId, d.vehicle_entity_id ?? null,
      d.description, d.sector, d.country, d.city, d.founded ?? null, d.business_model, d.team_size, d.linkedin, JSON.stringify(d.founders ?? []), d.lead_investor, d.investors, d.traction, d.deck_url, d.source === 'referral' ? d.referred_by : null, d.ai_unchecked, JSON.stringify(d.sources)])
  await audit({ event, actorUserId: user.userId, action: 'pipeline.create', objectType: 'deal', objectId: row.id, detail: { company: d.company, source: d.source, ai_fields: d.ai_unchecked.length } })
  return { ok: true, id: row.id }
})
