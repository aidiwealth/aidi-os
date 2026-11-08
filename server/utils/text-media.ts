// Pictures placed in text, stored as public media (served by /api/public/media/<id>) so they show in the app, on
// pages, in emails and in PDFs, whatever site they were copied from.
import { createHash, randomUUID } from 'node:crypto'
export const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
export async function storeTextImage(event: Parameters<typeof hostBrand>[0], data: Uint8Array, filename: string, mime: string): Promise<{ id: string; url: string }> {
  const ext = Object.entries(IMAGE_TYPES).find(([, m]) => m === mime)?.[0] ?? 'png'
  const id = randomUUID(), key = 'documents/' + id + '.' + ext
  await putObject({ key, body: data, contentType: mime })
  const name = filename.replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200) || 'image'
  await db().query("INSERT INTO core.documents (public_media, id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES (true, $1, $2, 'other', 'normal', $3, $4, $5, $6)", [id, 'Text image — ' + name, key, mime, data.length, createHash('sha256').update(data).digest('hex')])
  return { id, url: brands()[hostBrand(event)].url + '/api/public/media/' + id }
}
// What a file's first bytes say it is (a server's content-type is not trusted).
export function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}
