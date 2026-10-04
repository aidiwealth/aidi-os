// Create a tracked link to the data room (or chosen files), or update one: { id?, name, file_ids, require_email, allow_download, days, revoked }
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), file_ids: z.array(z.string().uuid()).max(200).default([]), require_email: z.boolean().default(true),
    allow_download: z.boolean().default(false), days: z.coerce.number().int().min(0).max(365).default(30), revoked: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the link (for example the investor or firm).')
  const d = b.data
  if (d.id) {
    await db().query("UPDATE fundraise.links SET name = $2, file_ids = $3, require_email = $4, allow_download = $5, expires_at = CASE WHEN $6 = 0 THEN NULL ELSE now() + make_interval(days => $6) END, revoked = coalesce($7, revoked) WHERE id = $1", [d.id, d.name, d.file_ids, d.require_email, d.allow_download, d.days, d.revoked ?? null])
    return { ok: true }
  }
  const token = randomToken()
  await db().query("INSERT INTO fundraise.links (name, file_ids, token_hash, require_email, allow_download, expires_at, created_by) VALUES ($1,$2,$3,$4,$5, CASE WHEN $6 = 0 THEN NULL ELSE now() + make_interval(days => $6) END, $7)", [d.name, d.file_ids, sha256(token), d.require_email, d.allow_download, d.days, user.userId])
  return { ok: true, url: brands().finvry.url + '/d/' + token }
})
