// Open a report attached to a shared board: a 60-second signed link, for anyone who can see the board. Logged.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const b = await boardByToken(event)
  const { email } = await requireBoardAccess(event, b)
  const doc = z.string().uuid().safeParse(getRouterParam(event, 'doc'))
  if (!doc.success || !(b.documents ?? []).includes(doc.data)) throw apiError('not_found', 'Report not found', 404)
  await rateLimit('board_report_pub', clientIp(event), 60, 60 * 60 * 1000)
  const d = (await db().query<{ title: string; storage_key: string }>('SELECT title, storage_key FROM core.documents WHERE id = $1', [doc.data])).rows[0]
  if (!d) throw apiError('not_found', 'Report not found', 404)
  const ext = d.storage_key.split('.').pop() ?? 'pdf'
  const url = await signedGetUrl({ key: d.storage_key, filename: d.title.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 80) + '.' + ext, seconds: 60 })
  await audit({ event, actorUserId: null, action: 'document.download', objectType: 'document', objectId: doc.data, detail: { board: b.id, via: 'board_link', email } })
  return { url }
})
