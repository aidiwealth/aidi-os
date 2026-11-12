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
  // ?w=: a photo resized for the screen (the original can be several megabytes). Made once with sharp, kept in storage
  // next to the original and in memory; the original is sent when it is already small or anything goes wrong.
  const w = Number(getQuery(event).w) || 0
  if (w > 0 && /^image\/(png|jpe?g|webp)$/.test(d.mime_type)) {
    const width = [480, 800, 1200, 1600].find((x) => x >= w) ?? 1600, key = d.storage_key + '.w' + width + '.webp'
    const hit = sized.get(key)
    if (hit) { setHeader(event, 'content-type', hit.type); return Buffer.from(hit.body) }
    try {
      let body: Uint8Array | null = null, type = 'image/webp'
      try { body = await getObject(key) } catch { body = null }
      if (!body) {
        const src = await getObject(d.storage_key)
        if (src.length < 120_000) { body = src; type = d.mime_type }
        else {
          const sharp = (await import('sharp')).default
          body = new Uint8Array(await sharp(Buffer.from(src)).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer())
          if (body.length >= src.length) { body = src; type = d.mime_type } else putObject({ key, body, contentType: type }).catch(() => {})
        }
      }
      remember(key, body, type)
      setHeader(event, 'content-type', type)
      return Buffer.from(body)
    } catch (err) { console.error('[media] resize', (err as Error).message) }
  }
  return Buffer.from(await getObject(d.storage_key))
})

// Resized images kept in memory (up to about 60 MB, oldest out first).
const sized = new Map<string, { body: Uint8Array; type: string }>()
let sizedBytes = 0
function remember(key: string, body: Uint8Array, type: string) {
  if (body.length > 4_000_000) return
  sized.set(key, { body, type }); sizedBytes += body.length
  while (sizedBytes > 60_000_000) { const k = sized.keys().next().value as string; sizedBytes -= sized.get(k)!.body.length; sized.delete(k) }
}
