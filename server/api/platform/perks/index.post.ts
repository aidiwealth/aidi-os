// Console: add, edit or remove a perk.
import { z } from 'zod'
const url = z.string().trim().max(1000).refine((v) => !v || /^https:\/\//.test(v), 'Links must start with https://').default('')
export default defineEventHandler(async (event) => {
  const s = await requirePlatform(event, true)
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), partner: z.string().trim().min(1).max(120).optional(), logo_url: url, website: url, category: z.string().regex(/^[a-z_]{2,30}$/).default('other'),
    headline: z.string().trim().max(120).default(''), summary: z.string().trim().max(400).default(''), details: z.string().trim().max(6000).default(''), redeem: z.string().trim().max(4000).default(''), code: z.string().trim().max(80).default(''), claim_url: url,
    value_usd: z.coerce.number().min(0).max(1e8).nullable().optional().or(z.literal('').transform(() => null)), audience: z.enum(['all', 'paid']).default('all'), public: z.boolean().default(true), featured: z.boolean().default(false), active: z.boolean().default(true),
    expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null)), sort: z.coerce.number().int().min(0).max(9999).default(0) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', b.error.issues[0]?.message ?? 'Check the perk details.')
  const d = b.data
  if (d.delete && d.id) { await asPlatform(() => db().query('DELETE FROM core.perks WHERE id = $1', [d.id])); await audit({ event, actorUserId: s.userId, action: 'perk.deleted', objectType: 'perk', objectId: d.id }); return { ok: true } }
  if (!d.partner || !d.headline || !d.summary) throw apiError('invalid', 'Add the partner, the offer and a short summary.')
  const vals = [d.partner, d.logo_url || null, d.website || null, d.category, d.headline, d.summary, d.details || null, d.redeem || null, d.code || null, d.claim_url || null, d.value_usd ?? null, d.audience, d.public, d.featured, d.active, d.expires_on ?? null, d.sort]
  const id = await asPlatform(async () => d.id
    ? ((await db().query('UPDATE core.perks SET partner=$2, logo_url=$3, website=$4, category=$5, headline=$6, summary=$7, details=$8, redeem=$9, code=$10, claim_url=$11, value_usd=$12, audience=$13, public=$14, featured=$15, active=$16, expires_on=$17, sort=$18, updated_at=now() WHERE id=$1', [d.id, ...vals])).rowCount ? d.id : null)
    : (await one<{ id: string }>('INSERT INTO core.perks (partner, logo_url, website, category, headline, summary, details, redeem, code, claim_url, value_usd, audience, public, featured, active, expires_on, sort, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id', [...vals, s.userId])).id)
  if (!id) throw apiError('not_found', 'Perk not found', 404)
  await audit({ event, actorUserId: s.userId, action: 'perk.saved', objectType: 'perk', objectId: id })
  return { ok: true, id }
})
