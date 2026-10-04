// Upload an image (cover or block) or a file to attach to an update.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv' }
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a file.')
  if (file.data.length > 20 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 20 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload an image (PNG, JPG, GIF, WebP) or a PDF, Office or CSV file.')
  const id = randomUUID(), key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  const name = (file.filename ?? 'file').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200) || 'file'
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)", [id, 'Update media — ' + name, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  return { ok: true, id, name, image: mime.startsWith('image/') }
})
