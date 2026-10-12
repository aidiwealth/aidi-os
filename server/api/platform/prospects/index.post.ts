// Console: add, edit or remove an investor or grant in the founders' search list.
import { z } from 'zod'
const n = z.union([z.coerce.number().min(0).max(1e12), z.literal('').transform(() => null), z.null()]).optional()
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), kind: z.enum(['investor', 'grant']).default('investor'), name: z.string().trim().min(2).max(200).optional(), type: z.enum(['vc', 'angel_network', 'accelerator', 'corporate', 'government', 'foundation', 'competition', 'credits', 'other']).default('vc'),
    regions: z.array(z.string().trim().min(2).max(60)).max(30).default(['Global']), stages: z.array(z.enum(RAISE_STAGES)).max(6).default([]), sectors: z.array(z.string().max(30)).max(14).default([]), min_usd: n, max_usd: n,
    website: z.string().trim().max(300).default(''), description: z.string().trim().max(2000).default(''), how_to_apply: z.string().trim().max(1000).default(''), deadline: z.string().trim().max(120).default(''), active: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the details.')
  const d = b.data
  if (d.id && d.delete) { await asPlatform(() => db().query('DELETE FROM crm.prospects WHERE id = $1', [d.id])); return { ok: true } }
  if (!d.name) throw apiError('invalid', 'Add a name.')
  if (d.website && !/^https?:\/\//i.test(d.website)) throw apiError('invalid', 'The website must start with http:// or https://')
  const vals = [d.kind, d.name, d.type, d.regions.length ? d.regions : ['Global'], d.stages, d.sectors, d.min_usd ?? null, d.max_usd ?? null, d.website || null, d.description || null, d.how_to_apply || null, d.deadline || null, d.active]
  try {
    if (d.id) await asPlatform(() => db().query('UPDATE crm.prospects SET kind = $2, name = $3, type = $4, regions = $5, stages = $6, sectors = $7, min_usd = $8, max_usd = $9, website = $10, description = $11, how_to_apply = $12, deadline = $13, active = $14, updated_at = now() WHERE id = $1', [d.id, ...vals]))
    else await asPlatform(() => db().query('INSERT INTO crm.prospects (kind, name, type, regions, stages, sectors, min_usd, max_usd, website, description, how_to_apply, deadline, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', vals))
  } catch (e) { if ((e as { code?: string }).code === '23505') throw apiError('taken', 'That name is already on the list.', 409); throw e }
  await audit({ event, actorUserId: staff.userId, action: 'platform.prospect_saved', objectType: 'prospect', objectId: d.id ?? d.name })
  return { ok: true }
})
