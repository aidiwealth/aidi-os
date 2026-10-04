// Open a file from a data room link: records who and when, returns a short-lived link to view it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  rateLimit('dr_open', clientIp(event), 120, 60 * 60 * 1000)
  const token = String(getRouterParam(event, 'token') ?? '')
  const b = z.object({ file_id: z.string().uuid(), email: z.string().trim().max(254).default(''), download: z.boolean().default(false) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  if (token.length < 30) throw apiError('invalid_link', 'This link is not valid.', 404)
  const l = (await asPlatform(() => db().query<{ id: string; organization_id: string; name: string; file_ids: string[]; require_email: boolean; allow_download: boolean; dead: boolean; notify: boolean }>(
    "SELECT id, organization_id, name, file_ids, require_email, allow_download, (revoked OR (expires_at IS NOT NULL AND expires_at < now())) AS dead, (last_viewed_at IS NULL OR last_viewed_at < now() - interval '1 hour') AS notify FROM fundraise.links WHERE token_hash = $1", [sha256(token)]))).rows[0]
  if (!l) throw apiError('invalid_link', 'This link is not valid.', 404)
  if (l.dead) throw apiError('expired', 'This link is no longer active.', 410)
  if (l.require_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.data.email)) throw apiError('email', 'Enter your email to view.', 400)
  if (l.file_ids.length && !l.file_ids.includes(b.data.file_id)) throw apiError('not_found', 'Not found', 404)
  setOrgContext(l.organization_id)
  const f = (await db().query<{ title: string; storage_key: string }>('SELECT f.title, d.storage_key FROM fundraise.files f JOIN core.documents d ON d.id = f.document_id WHERE f.id = $1', [b.data.file_id])).rows[0]
  if (!f) throw apiError('not_found', 'Not found', 404)
  const v = await one<{ id: string }>('INSERT INTO fundraise.views (organization_id, link_id, file_id, viewer_email) VALUES ($1,$2,$3,$4) RETURNING id', [l.organization_id, l.id, b.data.file_id, b.data.email.toLowerCase() || null])
  await db().query('UPDATE fundraise.links SET views = views + 1, last_viewed_at = now() WHERE id = $1', [l.id])
  if (l.notify) { const to = await orgNotifyEmails(); for (const e of to) sendShareViewedEmail(e, 'Data room: ' + l.name + (b.data.email ? ' (' + b.data.email + ')' : ''), brands().finvry.url + '/fundraising').catch(() => {}) }
  return { view_id: v.id, url: await signedGetUrl({ key: f.storage_key, filename: f.title, seconds: 300, inline: !(b.data.download && l.allow_download) }) }
})
