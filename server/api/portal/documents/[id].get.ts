// A short-lived download link, only for documents shared with or uploaded by this client.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const d = (await db().query<{ storage_key: string; title: string }>(
    `SELECT d.storage_key, d.title FROM core.documents d WHERE d.id = $1 AND (
       EXISTS (SELECT 1 FROM services.job_events e JOIN services.jobs j ON j.id = e.job_id WHERE e.document_id = d.id AND e.visible_to_client AND j.client_id = $2)
       OR EXISTS (SELECT 1 FROM services.request_files f JOIN services.info_requests r ON r.id = f.request_id WHERE f.document_id = d.id AND r.client_id = $2))`, [id.data, u.clientId])).rows[0]
  if (!d) throw apiError('not_found', 'Not found', 404)
  return { url: await signedGetUrl({ key: d.storage_key, filename: d.title.split(' — ').pop() ?? 'document', seconds: 120 }) }
})
