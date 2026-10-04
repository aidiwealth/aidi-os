// The client uploads a document to a job for the team to review, with a note on what it is.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', csv: 'text/csv', txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('portal_upload', u.personId, 40, 60 * 60 * 1000)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const j = (await db().query<{ title: string; owner_email: string | null }>('SELECT j.title, ou.email AS owner_email FROM services.jobs j LEFT JOIN core.users ou ON ou.id = j.owner_id WHERE j.id = $1 AND j.client_id = $2', [id, u.clientId])).rows[0]
  if (!j) throw apiError('not_found', 'Not found', 404)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  const note = (parts?.find((p) => p.name === 'note')?.data.toString() ?? '').trim().slice(0, 1000)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a file.')
  if (file.data.length > 25 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 25 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PDF, Word, Excel, CSV, text or image file.')
  const docId = randomUUID(), key = 'documents/' + docId + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  const title = (file.filename ?? 'document').replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 120) || 'document'
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)",
    [docId, u.client + ' — ' + title, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  await db().query("INSERT INTO services.job_events (job_id, kind, body, document_id, visible_to_client) VALUES ($1, 'client_document', $2, $3, true)", [id, note || null, docId])
  await db().query('UPDATE services.jobs SET updated_at = now() WHERE id = $1', [id])
  sendJobClientActivity(j.owner_email, id, u.client, j.title, u.name + ' uploaded ' + title, note).catch((e) => console.error('[portal] alert failed', e))
  return { ok: true }
})
