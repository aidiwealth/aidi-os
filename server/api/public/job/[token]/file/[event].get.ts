// The client downloads a document shared on their job (60-second link).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const j = await jobFromToken(getRouterParam(event, 'token'))
  const ev = z.string().uuid().safeParse(getRouterParam(event, 'event'))
  if (!ev.success) throw apiError('not_found', 'File not found', 404)
  const r = await db().query<{ title: string; storage_key: string }>(
    `SELECT d.title, d.storage_key FROM services.job_events e JOIN core.documents d ON d.id = e.document_id
      WHERE e.id = $1 AND e.job_id = $2 AND e.visible_to_client AND d.sensitivity = 'normal'`, [ev.data, j.id])
  const d = r.rows[0]
  if (!d) throw apiError('not_found', 'File not found', 404)
  const ext = d.storage_key.split('.').pop() ?? 'bin'
  const url = await signedGetUrl({ key: d.storage_key, filename: d.title.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 80) + '.' + ext, seconds: 60 })
  await audit({ event, actorUserId: null, action: 'services.client_download', objectType: 'job', objectId: j.id, detail: { event_id: ev.data } })
  return sendRedirect(event, url, 302)
})
