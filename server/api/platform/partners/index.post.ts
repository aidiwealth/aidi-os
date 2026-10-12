// Console: add, edit, approve, pause or remove a partner and its discount code.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), name: z.string().trim().min(2).max(200).optional(), kind: z.enum(['vc', 'incubator', 'accelerator', 'startup', 'community', 'university', 'other']).default('vc'),
    website: z.string().trim().max(300).default(''), logo_url: z.string().trim().max(500).default(''), contact_name: z.string().trim().max(200).default(''), contact_email: z.string().trim().max(254).default(''), note: z.string().trim().max(2000).default(''),
    code: z.string().trim().max(30).default(''), discount_pct: z.coerce.number().int().min(1).max(100).default(20), months: z.union([z.coerce.number().int().min(1).max(60), z.literal('').transform(() => null), z.null()]).optional(),
    max_redemptions: z.union([z.coerce.number().int().min(1), z.literal('').transform(() => null), z.null()]).optional(), expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(), status: z.enum(['pending', 'approved', 'paused', 'rejected']).default('approved'), listed: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the details.')
  const d = b.data
  if (d.id && d.delete) { await asPlatform(() => db().query('DELETE FROM platform.partners WHERE id = $1', [d.id])); return { ok: true } }
  if (!d.name) throw apiError('invalid', 'Add the partner name.')
  const code = d.code ? normCode(d.code) : d.status === 'approved' ? newPartnerCode(d.name) : null
  if (code && !/^[A-Z0-9-]{4,30}$/.test(code)) throw apiError('invalid', 'Codes use 4–30 letters, numbers or dashes.')
  const url = (u: string) => (u ? (/^https?:\/\//i.test(u) ? u : 'https://' + u) : null)
  const vals = [d.name, d.kind, url(d.website), url(d.logo_url), d.contact_name || null, d.contact_email || null, d.note || null, code, d.discount_pct, d.months ?? null, d.max_redemptions ?? null, d.expires_on || null, d.status, d.listed]
  try {
    if (d.id) await asPlatform(() => db().query('UPDATE platform.partners SET name = $2, kind = $3, website = $4, logo_url = $5, contact_name = $6, contact_email = $7, note = $8, code = $9, discount_pct = $10, months = $11, max_redemptions = $12, expires_on = $13, status = $14, listed = $15, updated_at = now() WHERE id = $1', [d.id, ...vals]))
    else await asPlatform(() => db().query('INSERT INTO platform.partners (name, kind, website, logo_url, contact_name, contact_email, note, code, discount_pct, months, max_redemptions, expires_on, status, listed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', vals))
  } catch (e) { if ((e as { code?: string }).code === '23505') throw apiError('taken', 'That code is already used by another partner.', 409); throw e }
  await audit({ event, actorUserId: staff.userId, action: 'platform.partner_saved', objectType: 'partner', objectId: d.id ?? d.name, detail: { status: d.status, discount_pct: d.discount_pct } })
  return { ok: true, code }
})
