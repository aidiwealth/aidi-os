// Upload a blog image (cover or inline).
import { randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const file = (await readMultipartFormData(event))?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose an image.')
  if (file.data.length > 10 * 1024 * 1024) throw apiError('too_large', 'Images can be up to 10 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PNG, JPG, GIF or WebP image.')
  const id = randomUUID(), key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  const name = (file.filename ?? 'image').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200) || 'image'
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes) VALUES ($1,$2,'other','normal',$3,$4,$5)", [id, 'Blog media — ' + name, key, mime, file.data.length])
  return { ok: true, id, url: brands().aidi.url + '/api/public/media/' + id }
})
