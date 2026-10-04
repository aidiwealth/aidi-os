// Save and publish (or unpublish) the investor page.
import { z } from 'zod'
const url = z.string().trim().max(500).refine((v) => v === '' || /^https?:\/\//i.test(v), 'Links must start with http:// or https://')
const Body = z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,40}$/), published: z.boolean(), headline: z.string().trim().max(200).default(''), about: z.string().trim().max(3000).default(''),
  website: url.default(''), deck_url: url.default(''), contact_email: z.string().trim().max(254).default(''), metrics: z.array(z.string()).max(8), period_type: z.enum(['month', 'quarter', 'year']) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', b.error.issues[0]?.message.includes('http') ? b.error.issues[0].message : 'Check the page address (letters, numbers and dashes) and the other fields.')
  const d = b.data
  const metrics = d.metrics.filter((m) => m in METRIC_LABEL)
  if (RESERVED_HANDLES.has(d.slug)) throw apiError('taken', 'That page address is reserved. Try another.', 409)
  const taken = await asPlatform(() => db().query('SELECT 1 FROM financials.public_pages WHERE slug = $1 AND organization_id <> $2', [d.slug, currentOrgId()]))
  if (taken.rowCount) throw apiError('taken', 'That page address is taken. Try another.', 409)
  await db().query(`INSERT INTO financials.public_pages (slug, published, headline, about, website, deck_url, contact_email, metrics, period_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (organization_id) DO UPDATE SET slug = $1, published = $2, headline = $3, about = $4, website = $5, deck_url = $6, contact_email = $7, metrics = $8, period_type = $9, updated_at = now()`,
    [d.slug, d.published, d.headline || null, d.about || null, d.website || null, d.deck_url || null, d.contact_email || null, metrics, d.period_type])
  await audit({ event, actorUserId: user.userId, action: d.published ? 'investor_page.publish' : 'investor_page.save', objectType: 'organization', objectId: currentOrgId()!, detail: { slug: d.slug } })
  return { ok: true, url: brands().finvry.url + '/c/' + d.slug }
})
