// Open a file from a data room link: checks the NDA, records who and when, returns a short-lived link to view it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  rateLimit('dr_open', clientIp(event), 120, 60 * 60 * 1000)
  const ref = String(getRouterParam(event, 'token') ?? '')
  const b0 = z.object({ file_id: z.string().uuid(), email: z.string().trim().max(254).default(''), download: z.boolean().default(false), nda: z.string().max(40).optional() }).safeParse(await readBody(event))
  if (!b0.success) throw apiError('invalid', 'Invalid request.')
  const d = b0.data
  const l = await findRoomLink(ref)
  if (!l) throw apiError('invalid_link', 'This link is not valid.', 404)
  if (l.dead) throw apiError('expired', 'This link is no longer active.', 410)
  const b = await brandingOf(l.organization_id)
  const signed = await ndaSigned(l.organization_id, d.nda)
  if (ndaOn(b, 'room') && !signed) throw apiError('nda', 'Please sign the NDA first.', 403)
  const email = (d.email || signed?.email || '').toLowerCase()
  if (l.require_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError('email', 'Enter your email to view.', 400)
  if (l.file_ids.length && !l.file_ids.includes(d.file_id)) throw apiError('not_found', 'Not found', 404)
  setOrgContext(l.organization_id)
  const f = (await db().query<{ title: string; storage_key: string; is_deck: boolean }>('SELECT f.title, d.storage_key, f.is_deck FROM fundraise.files f JOIN core.documents d ON d.id = f.document_id WHERE f.id = $1', [d.file_id])).rows[0]
  if (!f) throw apiError('not_found', 'Not found', 404)
  const v = await one<{ id: string }>('INSERT INTO fundraise.views (organization_id, link_id, file_id, viewer_email) VALUES ($1,$2,$3,$4) RETURNING id', [l.organization_id, l.id, d.file_id, email || null])
  await db().query('UPDATE fundraise.links SET views = views + 1, last_viewed_at = now() WHERE id = $1', [l.id])
  await logActivity(l.organization_id, email, f.is_deck ? 'deck_viewed' : 'file_viewed', 'Viewed ' + f.title, d.file_id)
  if (l.notify) { const to = await orgNotifyEmails(); for (const e of to) sendShareViewedEmail(e, 'Data room: ' + l.name + (email ? ' (' + email + ')' : ''), brands().finvry.url + '/fundraising').catch(() => {}) }
  const allowDownload = d.download && l.allow_download && !b.watermark
  return { view_id: v.id, url: await signedGetUrl({ key: f.storage_key, filename: f.title, seconds: 300, inline: !allowDownload }), watermark: b.watermark ? (email || 'Confidential') + ' · ' + new Date().toISOString().slice(0, 10) : null }
})
