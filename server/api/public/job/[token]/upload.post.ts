// The client uploads a document (PDF, Word, Excel, images; up to 25 MB). Stored privately and added to the job.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', csv: 'text/csv', txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}
export default defineEventHandler(async (event) => {
  rateLimit('job_upload', clientIp(event), 20, 60 * 60 * 1000)
  const j = await jobFromToken(getRouterParam(event, 'token'))
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a file.')
  if (file.data.length > 25 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 25 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PDF, Word, Excel, CSV, text or image file.')
  const docId = randomUUID(), key = 'documents/' + docId + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  const title = (file.filename ?? 'document').replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 120) || 'document'
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)",
    [docId, j.client + ' — ' + title, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  await db().query("INSERT INTO services.job_events (job_id, kind, document_id, visible_to_client) VALUES ($1, 'client_document', $2, true)", [j.id, docId])
  await db().query('UPDATE services.jobs SET updated_at = now() WHERE id = $1', [j.id])
  await audit({ event, actorUserId: null, action: 'services.client_upload', objectType: 'job', objectId: j.id, detail: { document_id: docId } })
  sendJobClientActivity(j.owner_email, j.id, j.client, j.title, 'uploaded ' + title, '').catch((e) => console.error('[services] alert failed', e))
  return { ok: true }
})
