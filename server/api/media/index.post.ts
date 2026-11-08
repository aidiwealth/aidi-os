// An image placed in text (any editor): stored as public media and linked from the text by a random address.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose an image.')
  if (file.data.length > 10 * 1024 * 1024) throw apiError('too_large', 'Images can be up to 10 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? '', mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PNG, JPG, GIF or WebP image.')
  const id = randomUUID(), key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  const name = (file.filename ?? 'image').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200) || 'image'
  await db().query("INSERT INTO core.documents (public_media, id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES (true, $1, $2, 'other', 'normal', $3, $4, $5, $6)", [id, 'Text image — ' + name, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  return { id, url: brands()[hostBrand(event)].url + '/api/public/media/' + id }
})
