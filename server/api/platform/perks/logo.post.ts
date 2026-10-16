// Console: upload a partner logo for a perk (PNG, JPG, WebP or SVG); returns a public URL.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }
export default defineEventHandler(async (event) => {
  await requirePlatform(event, true)
  const file = (await readMultipartFormData(event))?.find((p) => p.name === 'file' && p.filename && p.data.length)
  if (!file) throw apiError('invalid', 'Choose a logo image.')
  if (file.data.length > 2 * 1024 * 1024) throw apiError('too_large', 'Logos can be up to 2 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? '', mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PNG, JPG, WebP or SVG logo.')
  if (ext === 'svg' && /<script|on\w+=|javascript:/i.test(file.data.toString('utf8'))) throw apiError('bad_type', 'That SVG has scripts in it. Export a plain logo.')
  const id = randomUUID(), key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  await db().query("INSERT INTO core.documents (public_media, id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES (true, $1,$2,'other','normal',$3,$4,$5,$6)", [id, 'Perk logo — ' + (file.filename ?? 'logo').slice(0, 150), key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  return { ok: true, url: brands().finvry.url + '/api/public/media/' + id }
})
