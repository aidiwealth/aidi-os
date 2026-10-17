// Add or edit a prospective LP by hand.
import { z } from 'zod'
const s = (n: number) => z.string().trim().max(n).default('')
const Body = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), kind: z.string().max(40).default('other'), capital: z.enum(['equity', 'debt', 'both']).default('equity'), country: s(100),
  regions: z.array(z.string().trim().max(60)).max(12).default([]), sectors: z.array(z.string().trim().max(60)).max(12).default([]), aum_usd: z.coerce.number().min(0).max(1e14).nullable().default(null),
  ticket_min_usd: z.coerce.number().min(0).max(1e13).nullable().default(null), ticket_max_usd: z.coerce.number().min(0).max(1e13).nullable().default(null), mandate: s(2000), backs_emerging: z.boolean().nullable().default(null),
  website: s(300), contact_name: s(200), contact_title: s(200), email: s(254), linkedin: s(300), phone: s(60), notes: s(3000) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the LP\'s name; check the amounts.')
  const d = b.data, r = cleanRow({ ...d })!
  if (!r) throw apiError('invalid', 'Add the LP\'s name.')
  if (d.email && !r.email) throw apiError('invalid', 'That email address does not look right.')
  if (!d.id) {
    if ((await db().query('SELECT 1 FROM funds.lp_prospects WHERE lower(name) = lower($1)', [r.name])).rowCount) throw apiError('exists', r.name + ' is already on the list.', 409)
    const { ids } = await saveProspects([r], 'manual', user.userId)
    return { ok: true, id: ids.get(r.name.toLowerCase()) }
  }
  const x = await db().query(`UPDATE funds.lp_prospects SET name=$2, kind=$3, capital=$4, country=$5, regions=$6, sectors=$7, aum_usd=$8, ticket_min_usd=$9, ticket_max_usd=$10, mandate=$11, backs_emerging=$12, website=$13, contact_name=$14, contact_title=$15, email=$16, linkedin=$17, phone=$18, notes=$19, updated_at=now() WHERE id=$1`,
    [d.id, r.name, r.kind, r.capital, r.country || null, r.regions, r.sectors, d.aum_usd, d.ticket_min_usd, d.ticket_max_usd, r.mandate || null, d.backs_emerging, r.website || null, r.contact_name || null, r.contact_title || null, r.email || null, r.linkedin || null, r.phone || null, r.notes || null])
    .catch((e: { code?: string }) => { if (e.code === '23505') throw apiError('exists', 'Another LP already has that name.', 409); throw e })
  if (!x.rowCount) throw apiError('not_found', 'Not found', 404)
  return { ok: true, id: d.id }
})
