// Images and files embedded in investor updates, investor pages and blog posts (only documents uploaded as public
// media by those editors; a title never makes a document public). Streamed so they load under the
// app's security policy and in emails.
export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const d = (await asPlatform(() => db().query<{ storage_key: string; title: string; mime_type: string }>("SELECT storage_key, title, mime_type FROM core.documents WHERE id = $1 AND public_media", [id]))).rows[0]
  if (!d) throw apiError('not_found', 'Not found', 404)
  // The file name without its label ("Text image — logo.png" → logo.png). Headers take plain ASCII only (a dash or
  // accent there failed the whole request), so the readable name goes in filename* as well.
  const name = d.title.replace(/^(Update media|Blog media|Perk logo|Company logo|Text image) — /, '').replace(/["\\]/g, '')
  const ascii = name.replace(/[^\x20-\x7e]/g, '_') || 'file'
  setHeader(event, 'content-type', d.mime_type)
  setHeader(event, 'cache-control', 'public, max-age=86400, immutable')
  setHeader(event, 'content-disposition', (d.mime_type.startsWith('image/') || d.mime_type === 'application/pdf' ? 'inline' : 'attachment') + '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(name))
  if (d.mime_type === 'image/svg+xml') setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
  return Buffer.from(await getObject(d.storage_key))
})
