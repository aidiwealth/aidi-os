// Images and files embedded in investor updates, investor pages and blog posts. Streamed so they load under the
// app's security policy and in emails.
export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const d = (await asPlatform(() => db().query<{ storage_key: string; title: string; mime_type: string }>("SELECT storage_key, title, mime_type FROM core.documents WHERE id = $1 AND (title LIKE 'Update media — %' OR title LIKE 'Blog media — %')", [id]))).rows[0]
  if (!d) throw apiError('not_found', 'Not found', 404)
  const name = d.title.replace('Update media — ', '').replace('Blog media — ', '').replace(/"/g, '')
  setHeader(event, 'content-type', d.mime_type)
  setHeader(event, 'cache-control', 'public, max-age=86400, immutable')
  setHeader(event, 'content-disposition', (d.mime_type.startsWith('image/') || d.mime_type === 'application/pdf' ? 'inline' : 'attachment') + '; filename="' + name + '"')
  if (d.mime_type === 'image/svg+xml') setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
  return Buffer.from(await getObject(d.storage_key))
})
