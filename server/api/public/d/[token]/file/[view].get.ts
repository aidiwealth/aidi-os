// A PDF from the data room, stamped on every page with the viewer's email, company and date (watermarking on).
export default defineEventHandler(async (event) => {
  const ref = String(getRouterParam(event, 'token') ?? ''), view = String(getRouterParam(event, 'view') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(view)) throw apiError('not_found', 'Not found', 404)
  const l = await findRoomLink(ref)
  if (!l || l.dead) throw apiError('invalid_link', 'This link is not valid.', 404)
  const v = (await asPlatform(() => db().query<{ viewer_email: string | null; storage_key: string; title: string; company: string }>(
    `SELECT v.viewer_email, d.storage_key, f.title, o.name AS company FROM fundraise.views v JOIN fundraise.files f ON f.id = v.file_id JOIN core.documents d ON d.id = f.document_id JOIN core.organizations o ON o.id = v.organization_id
      WHERE v.id = $1 AND v.link_id = $2 AND v.started_at > now() - interval '20 minutes' AND d.mime_type = 'application/pdf'`, [view, l.id]))).rows[0]
  if (!v) throw apiError('expired', 'This view has expired. Open the file again.', 410)
  const day = new Date().toISOString().slice(0, 10)
  const out = await stampPdf(await getObject(v.storage_key), (v.viewer_email || 'Confidential') + ' · ' + day, 'Confidential. Shared by ' + v.company + ' with ' + (v.viewer_email || 'a viewer') + ' on ' + day + ' via Finvry. Do not forward.')
  const dl = getQuery(event).dl === '1' && l.allow_download
  setHeader(event, 'content-type', 'application/pdf'); setHeader(event, 'cache-control', 'no-store')
  setHeader(event, 'content-disposition', (dl ? 'attachment' : 'inline') + '; filename="' + v.title.replace(/["\\\r\n]/g, '_') + '"')
  return Buffer.from(out)
})
