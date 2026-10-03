// Add or edit a listed professional.
import { z } from 'zod'
import { PRO_SERVICE_KEYS } from '~/server/utils/professionals'
const url = z.string().trim().url().startsWith('https://').max(500).optional().or(z.literal('').transform(() => undefined))
const Body = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), firm: z.string().trim().max(200).optional(), title: z.string().trim().max(200).optional(),
  services: z.array(z.enum(PRO_SERVICE_KEYS)).max(12), jurisdictions: z.array(z.string().trim().min(1).max(60)).max(20), bio: z.string().trim().max(2000).optional(),
  email: z.string().trim().email().max(254), phone: z.string().trim().max(40).optional(), website: url, photo_url: url, featured: z.boolean().default(false), active: z.boolean().default(true)
})
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the name, a valid email and at least one service. Links must start with https://.')
  const d = b.data
  const vals = [d.name, d.firm || null, d.title || null, d.services, d.jurisdictions, d.bio || null, d.email.toLowerCase(), d.phone || null, d.website ?? null, d.photo_url ?? null, d.featured, d.active]
  const id = await asPlatform(async () => {
    if (d.id) {
      const r = await db().query<{ id: string }>(`UPDATE platform.professionals SET name=$2, firm=$3, title=$4, services=$5, jurisdictions=$6, bio=$7, email=$8, phone=$9, website=$10, photo_url=$11, featured=$12, active=$13, updated_at=now() WHERE id=$1 RETURNING id`, [d.id, ...vals])
      if (!r.rows[0]) throw apiError('not_found', 'Not found', 404)
      return r.rows[0].id
    }
    return (await db().query<{ id: string }>(`INSERT INTO platform.professionals (name, firm, title, services, jurisdictions, bio, email, phone, website, photo_url, featured, active, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [...vals, staff.userId])).rows[0]!.id
  })
  await platformAudit(event, staff.userId, d.id ? 'professional_update' : 'professional_add', null, { name: d.name })
  return { ok: true, id }
})
