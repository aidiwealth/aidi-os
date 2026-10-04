// Images and files embedded in investor updates (email and web). Only update media is served here.
export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const d = (await asPlatform(() => db().query<{ storage_key: string; title: string; mime_type: string }>("SELECT storage_key, title, mime_type FROM core.documents WHERE id = $1 AND title LIKE 'Update media — %'", [id]))).rows[0]
  if (!d) throw apiError('not_found', 'Not found', 404)
  setHeader(event, 'cache-control', 'private, max-age=240')
  return sendRedirect(event, await signedGetUrl({ key: d.storage_key, filename: d.title.replace('Update media — ', ''), seconds: 300, inline: d.mime_type.startsWith('image/') || d.mime_type === 'application/pdf' }), 302)
})
