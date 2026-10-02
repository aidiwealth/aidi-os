// A 60-second signed link to one document, after checking access. Every view is written to the audit log.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Document not found', 404)
  const r = await db().query<{ title: string; sensitivity: Sensitivity; storage_key: string; mime_type: string; entity_id: string | null }>(
    'SELECT title, sensitivity, storage_key, mime_type, entity_id FROM core.documents WHERE id = $1', [id.data])
  const d = r.rows[0]
  if (!d || !canSee(user.roles, d.sensitivity)) throw apiError('not_found', 'Document not found', 404)
  rateLimit('doc_download', user.userId, 120, 60 * 60 * 1000)
  const ext = d.storage_key.split('.').pop() ?? 'bin'
  const url = await signedGetUrl({ key: d.storage_key, filename: d.title.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 80) + '.' + ext, seconds: 60 })
  await audit({ event, actorUserId: user.userId, action: 'document.download', objectType: 'document', objectId: id.data, entityId: d.entity_id ?? undefined, detail: { sensitivity: d.sensitivity } })
  return { url }
})
