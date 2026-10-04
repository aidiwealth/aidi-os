// Upload the company logo (PNG, JPG, SVG-free for safety; up to 2 MB).
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose an image.')
  if (file.data.length > 2 * 1024 * 1024) throw apiError('too_large', 'Logos can be up to 2 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PNG, JPG or WebP image.')
  const id = randomUUID(), key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)", [id, 'Update media — logo.' + ext, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  return { ok: true, id }
})
