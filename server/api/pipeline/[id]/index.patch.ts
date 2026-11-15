// Update deal details: owner, vehicle, round, amounts and the company profile. Editing a field AI filled clears its
// "not checked" mark; accepting AI suggestions marks those fields as filled by AI (unchecked) and keeps its sources.
import { z } from 'zod'
const money = z.coerce.number().int().min(0).max(100_000_000_000).nullable().optional()
const Body = z.object({
  owner_id: z.string().uuid().nullable().optional(),
  vehicle_entity_id: z.string().uuid().optional(),
  company: z.string().trim().min(1).max(200).optional(),
  round: z.enum(['pre_seed', 'seed', 'series_a', 'series_b', 'later']).nullable().optional(),
  raise_usd: money, check_usd: money, valuation_usd: money,
  ...ProfileFields,
  checked: z.array(z.enum(AI_KEYS)).max(30).optional(), // marked as checked without changing them
  from_ai: z.array(z.enum(AI_KEYS)).max(30).optional(), // these values came from AI just now
  sources: Sources.optional()
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const raw = await readBody(event) as Record<string, unknown>
  const b = Body.safeParse(raw)
  if (!id.success || !b.success) throw apiError('invalid', 'Check ' + String(b.error?.issues[0]?.path[0] ?? 'the values').replace(/_/g, ' ') + ' and try again.')
  await assertFund(b.data.vehicle_entity_id)
  const { checked, from_ai, sources, ...rest } = b.data
  // Only fields the request actually sent (zod fills optional text fields with null).
  const fields = Object.entries(rest).filter(([k, v]) => v !== undefined && k in raw)
  const vals: unknown[] = fields.map(([k, v]) => (k === 'founders' ? JSON.stringify(v) : v === '' ? null : v))
  const sets = fields.map(([k], i) => k + ' = $' + (i + 2) + (k === 'founders' ? '::jsonb' : ''))
  const ai = from_ai ?? [], cleared = [...new Set([...fields.map(([k]) => k).filter((k) => !ai.includes(k as never)), ...(checked ?? [])])]
  const n = vals.length + 2
  sets.push(`ai_unchecked = ARRAY(SELECT DISTINCT x FROM unnest(array_cat(ai_unchecked, $${n}::text[])) x WHERE x <> ALL($${n + 1}::text[]))`)
  vals.push(ai, cleared)
  if (sources) { sets.push(`ai_sources = $${n + 2}::jsonb, ai_looked_up_at = now()`); vals.push(JSON.stringify(sources)) }
  const u = await db().query('UPDATE deals.deals SET ' + sets.join(', ') + ' WHERE id = $1', [id.data, ...vals])
  if (u.rowCount !== 1) throw apiError('not_found', 'Deal not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'pipeline.update', objectType: 'deal', objectId: id.data, detail: { fields: fields.map(([k]) => k), from_ai: ai, checked: checked ?? [] } })
  return { ok: true }
})
