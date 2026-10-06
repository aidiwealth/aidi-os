// Create or save a blog post; publishing sets the date (today unless given).
import { z } from 'zod'
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110) || 'post'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), title: z.string().trim().min(1).max(200), slug: z.string().trim().max(120).default(''), description: z.string().trim().max(500).default(''), tag: z.string().trim().max(60).default(''),
    body: z.string().max(200000).default(''), cover_id: z.string().uuid().nullable().optional(), author_name: z.string().trim().max(120).default(''), status: z.enum(['draft', 'published']).default('draft'), featured: z.boolean().default(false),
    sort: z.coerce.number().int().min(-1000).max(1000).default(0), published_at: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''), seo_title: z.string().trim().max(200).default(''), seo_description: z.string().trim().max(300).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add a title and check the fields.')
  const d = b.data, slug = slugify(d.slug || d.title)
  const clash = (await db().query('SELECT 1 FROM content.posts WHERE slug = $1 AND id IS DISTINCT FROM $2', [slug, d.id ?? null])).rowCount
  if (clash) throw apiError('slug_taken', 'Another post already uses the address /' + slug + '. Change the slug.', 409)
  const pub = d.status === 'published' ? (d.published_at || new Date().toISOString().slice(0, 10)) : (d.published_at || null)
  const args = [slug, d.title, d.description || null, d.tag || null, d.body, d.cover_id ?? null, d.author_name || null, d.status, d.featured, d.sort, pub, d.seo_title || null, d.seo_description || null]
  let id = d.id
  if (id) { const r = await db().query('UPDATE content.posts SET slug = $2, title = $3, description = $4, tag = $5, body = $6, cover_id = $7, author_name = $8, status = $9, featured = $10, sort = $11, published_at = $12, seo_title = $13, seo_description = $14, updated_at = now() WHERE id = $1', [id, ...args]); if (!r.rowCount) throw apiError('not_found', 'Not found', 404) }
  else id = (await one<{ id: string }>('INSERT INTO content.posts (slug, title, description, tag, body, cover_id, author_name, status, featured, sort, published_at, seo_title, seo_description, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id', [...args, user.userId])).id
  await audit({ event, actorUserId: user.userId, action: 'blog.' + (d.status === 'published' ? 'publish' : 'save'), objectType: 'post', objectId: id })
  return { ok: true, id, slug }
})
