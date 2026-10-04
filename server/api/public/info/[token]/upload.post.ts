// Upload a file for one question (PDF, Word, Excel, CSV, images; up to 25 MB). Stored privately against the request.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', csv: 'text/csv', txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}
export default defineEventHandler(async (event) => {
  rateLimit('info_upload', clientIp(event), 40, 60 * 60 * 1000)
  const r = await infoFromToken(getRouterParam(event, 'token'))
  if (r.status === 'submitted') throw apiError('state', 'This information has already been submitted.', 409)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  const field = parts?.find((p) => p.name === 'field')?.data.toString() ?? ''
  if (!FILE_FIELDS.includes(field)) throw apiError('invalid', 'Unknown question.')
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a file.')
  if (file.data.length > 25 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 25 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PDF, Word, Excel, CSV, text or image file.')
  const n = (await one<{ n: number }>('SELECT count(*)::int AS n FROM services.request_files WHERE request_id = $1', [r.id])).n
  if (n >= 60) throw apiError('too_many', 'Up to 60 files per request.')
  const docId = randomUUID(), key = 'documents/' + docId + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  const title = (file.filename ?? 'document').replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 120) || 'document'
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)",
    [docId, r.client + ' — ' + r.tax_year + ' — ' + title, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  await db().query('INSERT INTO services.request_files (request_id, document_id, organization_id, field) VALUES ($1,$2,$3,$4)', [r.id, docId, r.organization_id, field])
  if (r.status === 'sent') await db().query("UPDATE services.info_requests SET status = 'in_progress' WHERE id = $1", [r.id])
  return { ok: true, id: docId, title }
})
