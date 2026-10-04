// Add a file to the data room (PDF, slides, spreadsheets, documents, images; up to 50 MB).
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  const folder = (parts?.find((p) => p.name === 'folder')?.data.toString() || 'General').trim().slice(0, 60) || 'General'
  const isDeck = parts?.find((p) => p.name === 'is_deck')?.data.toString() === 'true'
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a file.')
  if (file.data.length > 50 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 50 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PDF, PowerPoint, Excel, Word, CSV or image file.')
  const docId = randomUUID(), key = 'documents/' + docId + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  const title = (file.filename ?? 'file').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200) || 'file'
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)", [docId, 'Data room — ' + title, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  if (isDeck) await db().query('UPDATE fundraise.files SET is_deck = false')
  const r = await one<{ id: string }>('INSERT INTO fundraise.files (document_id, title, folder, is_deck) VALUES ($1,$2,$3,$4) RETURNING id', [docId, title, folder, isDeck])
  return { ok: true, id: r.id }
})
