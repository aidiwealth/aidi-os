// Create a tracked link to the data room (or chosen files), or update one: { id?, name, file_ids, require_email, allow_download, days, revoked }
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), file_ids: z.array(z.string().uuid()).max(200).default([]), require_email: z.boolean().default(true),
    allow_download: z.boolean().default(false), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,40}$/).or(z.literal('')).default(''), days: z.coerce.number().int().min(0).max(365).default(30), revoked: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the link (for example the investor or firm).')
  const d = b.data
  if (d.slug && (await db().query('SELECT 1 FROM fundraise.links WHERE slug = $1 AND id IS DISTINCT FROM $2', [d.slug, d.id ?? null])).rowCount) throw apiError('taken', 'You already have a link called "' + d.slug + '". Pick another name.', 409)
  const handle = (await db().query<{ slug: string }>('SELECT slug FROM financials.public_pages LIMIT 1')).rows[0]?.slug
  if (d.id) {
    await db().query("UPDATE fundraise.links SET name = $2, file_ids = $3, require_email = $4, allow_download = $5, expires_at = CASE WHEN $6 = 0 THEN NULL ELSE now() + make_interval(days => $6) END, revoked = coalesce($7, revoked), slug = coalesce(nullif($8, ''), slug) WHERE id = $1", [d.id, d.name, d.file_ids, d.require_email, d.allow_download, d.days, d.revoked ?? null, d.slug])
    return { ok: true }
  }
  const token = randomToken()
  await db().query("INSERT INTO fundraise.links (name, file_ids, token_hash, require_email, allow_download, expires_at, created_by, slug) VALUES ($1,$2,$3,$4,$5, CASE WHEN $6 = 0 THEN NULL ELSE now() + make_interval(days => $6) END, $7, nullif($8, ''))", [d.name, d.file_ids, sha256(token), d.require_email, d.allow_download, d.days, user.userId, d.slug])
  return { ok: true, url: brands().finvry.url + '/d/' + token, short: d.slug && handle ? brands().finvry.url + '/' + handle + '/' + d.slug : null }
})
