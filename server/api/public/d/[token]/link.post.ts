// Open a link category (a folder kept elsewhere, e.g. Google Drive) from a data room link: same checks as opening a
// file; the open is recorded in the activity, then the browser goes to the folder.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await rateLimit('dr_open', clientIp(event), 120, 60 * 60 * 1000)
  const ref = String(getRouterParam(event, 'token') ?? '')
  const b0 = z.object({ folder_id: z.string().uuid(), email: z.string().trim().max(254).default(''), nda: z.string().max(40).optional() }).safeParse(await readBody(event))
  if (!b0.success) throw apiError('invalid', 'Invalid request.')
  const d = b0.data
  const l = await findRoomLink(ref)
  if (!l) throw apiError('invalid_link', 'This link is not valid.', 404)
  if (l.dead) throw apiError('expired', 'This link is no longer active.', 410)
  if (await roomShut(event, ref, l.organization_id)) throw apiError('invite_only', 'This data room is invite-only. Confirm your email to open it.', 403)
  // Folder links show on links to a whole room and on the company's own data room address (every room); not on a
  // link to chosen files.
  if (l.file_ids.length) throw apiError('not_found', 'Not found', 404)
  const b = await brandingOf(l.organization_id)
  const signed = await ndaSigned(l.organization_id, d.nda)
  if (ndaOn(b, 'room') && !signed) throw apiError('nda', 'Please sign the NDA first.', 403)
  const email = (d.email || signed?.email || '').toLowerCase()
  if (l.require_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError('email', 'Enter your email to view.', 400)
  setOrgContext(l.organization_id)
  const f = (await db().query<{ name: string; link_url: string }>('SELECT name, link_url FROM fundraise.folders WHERE id = $1 AND ($2::uuid IS NULL OR room_id = $2) AND link_url IS NOT NULL', [d.folder_id, l.room_id ?? null])).rows[0]
  if (!f) throw apiError('not_found', 'Not found', 404)
  await db().query('UPDATE fundraise.links SET views = views + 1, last_viewed_at = now() WHERE id = $1', [l.id])
  await logActivity(l.organization_id, email, 'file_viewed', 'Opened the ' + f.name + ' folder (outside Finvry)')
  return { url: f.link_url }
})
