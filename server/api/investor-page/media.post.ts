// Upload the investor page logo or cover image (served publicly).
import { randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif' }
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const file = (await readMultipartFormData(event))?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose an image.')
  if (file.data.length > 8 * 1024 * 1024) throw apiError('too_large', 'Images can be up to 8 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? '', mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PNG, JPG, WebP, GIF or SVG image.')
  const id = randomUUID(), key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes) VALUES ($1,$2,'other','normal',$3,$4,$5)", [id, 'Update media — ' + (file.filename ?? 'image').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200), key, mime, file.data.length])
  return { ok: true, id }
})
