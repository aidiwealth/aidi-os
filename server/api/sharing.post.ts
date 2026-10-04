// Save sharing settings. The handle is the company's address (also its investor page address).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/).or(z.literal('')).default('')
  const b = z.object({ handle: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,40}$/), logo_id: z.string().uuid().nullable().default(null), bg: hex, fg: hex, hide_finvry: z.boolean().default(false), watermark: z.boolean().default(false),
    nda_enabled: z.boolean().default(false), nda_scopes: z.array(z.enum(['page', 'room', 'updates'])).max(3).default(['room']), nda_text: z.string().max(20000).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Your address can use lower-case letters, numbers and dashes (2 to 41 characters). Colours are hex like #0c1a2e.')
  const d = b.data, org = (await currentOrg())!
  if (RESERVED_HANDLES.has(d.handle)) throw apiError('taken', 'That address is reserved. Try another.', 409)
  const taken = await asPlatform(() => db().query('SELECT 1 FROM financials.public_pages WHERE slug = $1 AND organization_id <> $2', [d.handle, org.id]))
  if (taken.rowCount) throw apiError('taken', 'That address is taken. Try another.', 409)
  if (d.nda_enabled && !d.nda_scopes.length) throw apiError('invalid', 'Choose where the NDA applies.')
  await db().query('INSERT INTO financials.public_pages (slug) VALUES ($1) ON CONFLICT (organization_id) DO UPDATE SET slug = EXCLUDED.slug, updated_at = now()', [d.handle])
  await db().query(`INSERT INTO fundraise.brand (logo_id, bg, fg, hide_finvry, watermark, nda_enabled, nda_scopes, nda_text) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (organization_id) DO UPDATE SET logo_id = EXCLUDED.logo_id, bg = EXCLUDED.bg, fg = EXCLUDED.fg, hide_finvry = EXCLUDED.hide_finvry, watermark = EXCLUDED.watermark, nda_enabled = EXCLUDED.nda_enabled, nda_scopes = EXCLUDED.nda_scopes, nda_text = EXCLUDED.nda_text, updated_at = now()`,
    [d.logo_id, d.bg || null, d.fg || null, d.hide_finvry && org.plan_code !== 'company_free', d.watermark, d.nda_enabled, d.nda_scopes, d.nda_text.trim() || null])
  await audit({ event, actorUserId: user.userId, action: 'sharing.save', objectType: 'organization', objectId: org.id, detail: { handle: d.handle, nda: d.nda_enabled, watermark: d.watermark } })
  return { ok: true }
})
