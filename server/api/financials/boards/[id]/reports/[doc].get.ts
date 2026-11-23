// Open a report attached to a board: a 60-second signed link. Anyone who can see the board can open its reports, even
// without access to Documents. Every view is written to the audit log.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team', 'family')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id')), doc = z.string().uuid().safeParse(getRouterParam(event, 'doc'))
  if (!id.success || !doc.success) throw apiError('not_found', 'Report not found', 404)
  const d = (await db().query<{ title: string; storage_key: string }>(
    'SELECT d.title, d.storage_key FROM financials.boards b JOIN core.documents d ON d.id = $2 WHERE b.id = $1 AND $2 = ANY(b.documents)', [id.data, doc.data])).rows[0]
  if (!d) throw apiError('not_found', 'Report not found', 404)
  await rateLimit('board_report', user.userId, 120, 60 * 60 * 1000)
  const ext = d.storage_key.split('.').pop() ?? 'pdf'
  const url = await signedGetUrl({ key: d.storage_key, filename: d.title.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 80) + '.' + ext, seconds: 60 })
  await audit({ event, actorUserId: user.userId, action: 'document.download', objectType: 'document', objectId: doc.data, detail: { board: id.data } })
  return { url }
})
