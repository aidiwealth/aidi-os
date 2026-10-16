// A 60-second signed link to one document, after checking access. Every view is written to the audit log.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family', 'services')
  const deskOnly = !user.roles.some((r) => ['admin', 'gp', 'team', 'family'].includes(r))
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Document not found', 404)
  const r = await db().query<{ title: string; sensitivity: Sensitivity; storage_key: string; mime_type: string; entity_id: string | null; area: string; uploaded_by: string | null }>(
    'SELECT title, sensitivity, storage_key, mime_type, entity_id, area, uploaded_by FROM core.documents WHERE id = $1', [id.data])
  const d = r.rows[0]
  // The services desk opens services and support files only (as team would); nothing from the group library.
  if (d && deskOnly && !['services', 'support'].includes(d.area)) throw apiError('not_found', 'Document not found', 404)
  if (!d || !canSee(deskOnly ? [...user.roles, 'team'] : user.roles, d.sensitivity)) throw apiError('not_found', 'Document not found', 404)
  // Library documents not tied to one of their companies stay hidden from someone limited to some companies.
  const scope = String(event.context.entityScope ?? '')
  if (scope && d.area === 'org' && d.uploaded_by !== user.userId && !(d.entity_id && scope.split(',').includes(d.entity_id))) throw apiError('not_found', 'Document not found', 404)
  rateLimit('doc_download', user.userId, 120, 60 * 60 * 1000)
  const ext = d.storage_key.split('.').pop() ?? 'bin'
  const url = await signedGetUrl({ key: d.storage_key, filename: d.title.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 80) + '.' + ext, seconds: 60 })
  await audit({ event, actorUserId: user.userId, action: 'document.download', objectType: 'document', objectId: id.data, entityId: d.entity_id ?? undefined, detail: { sensitivity: d.sensitivity } })
  return { url }
})
