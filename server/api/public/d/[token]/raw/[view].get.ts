// A data room file streamed for the in-page viewer (same origin, short-lived, tied to the recorded view).
export default defineEventHandler(async (event) => {
  const ref = String(getRouterParam(event, 'token') ?? ''), view = String(getRouterParam(event, 'view') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(view)) throw apiError('not_found', 'Not found', 404)
  const l = await findRoomLink(ref)
  if (!l || l.dead) throw apiError('invalid_link', 'This link is not valid.', 404)
  const v = (await asPlatform(() => db().query<{ storage_key: string; title: string; mime_type: string }>(
    `SELECT d.storage_key, f.title, d.mime_type FROM fundraise.views v JOIN fundraise.files f ON f.id = v.file_id JOIN core.documents d ON d.id = f.document_id
      WHERE v.id = $1 AND v.link_id = $2 AND v.started_at > now() - interval '20 minutes'`, [view, l.id]))).rows[0]
  if (!v) throw apiError('expired', 'This view has expired. Open the file again.', 410)
  setHeader(event, 'content-type', v.mime_type); setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', 'inline; filename="' + v.title.replace(/["\\\r\n]/g, '_') + '"')
  return Buffer.from(await getObject(v.storage_key))
})
