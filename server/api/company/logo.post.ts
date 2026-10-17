// Set the company logo (drag and drop in Settings). Saved straight away; replaces the investor page logo too.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const file = (await readMultipartFormData(event))?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose an image.')
  if (file.data.length > 3 * 1024 * 1024) throw apiError('too_large', 'Logos can be up to 3 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? '', mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PNG, JPG or WebP image.')
  const id = randomUUID(), key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  await db().query("INSERT INTO core.documents (public_media, id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES (true, $1,$2,'other','normal',$3,$4,$5,$6)", [id, 'Company logo.' + ext, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  await setCompanyLogo(id)
  await audit({ event, actorUserId: user.userId, action: 'company.logo', objectType: 'document', objectId: id })
  return { ok: true, id, url: '/api/public/media/' + id, pdf_ok: ext !== 'webp' }
})
