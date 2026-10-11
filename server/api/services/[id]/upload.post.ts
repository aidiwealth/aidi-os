// The team uploads a file to a job (e.g. the filed certificate, EIN letter or return). It is stored with the services desk,
// not in the Documents library, and can be shared with the client, who is emailed.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', csv: 'text/csv', txt: 'text/plain', zip: 'application/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword'
}
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Job not found', 404)
  const j = (await db().query<{ title: string; email: string; contact_name: string; client_id: string; client: string }>(
    'SELECT j.title, c.email, c.contact_name, j.client_id, c.name AS client FROM services.jobs j JOIN services.clients c ON c.id = j.client_id WHERE j.id = $1', [id])).rows[0]
  if (!j) throw apiError('not_found', 'Job not found', 404)
  const parts = await readMultipartFormData(event)
  const files = (parts ?? []).filter((p) => p.name === 'file' && p.filename && p.data.length)
  const note = (parts?.find((p) => p.name === 'note')?.data.toString() ?? '').trim().slice(0, 2000)
  const visible = parts?.find((p) => p.name === 'visible')?.data.toString() === '1'
  if (!files.length) throw apiError('invalid', 'Choose a file.')
  if (files.length > 10) throw apiError('invalid', 'Upload up to 10 files at a time.')
  for (const f of files) {
    if (f.data.length > 25 * 1024 * 1024) throw apiError('too_large', (f.filename ?? 'A file') + ' is over 25 MB.', 413)
    if (!TYPES[(f.filename ?? '').split('.').pop()?.toLowerCase() ?? '']) throw apiError('bad_type', (f.filename ?? 'A file') + ': upload a PDF, Word, Excel, CSV, text, ZIP or image file.')
  }
  const names: string[] = []
  for (const f of files) {
    const ext = (f.filename ?? '').split('.').pop()!.toLowerCase(), mime = TYPES[ext]!
    const docId = randomUUID(), key = 'documents/' + docId + '.' + ext
    await putObject({ key, body: new Uint8Array(f.data), contentType: mime })
    const title = (f.filename ?? 'file').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150) || 'file'
    await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by, area) VALUES ($1,$2,'other','normal',$3,$4,$5,$6,$7,'services')",
      [docId, title, key, mime, f.data.length, createHash('sha256').update(f.data).digest('hex'), user.userId])
    await db().query("INSERT INTO services.job_events (job_id, kind, body, document_id, visible_to_client, created_by) VALUES ($1, 'document', $2, $3, $4, $5)", [id, names.length ? null : note || null, docId, visible, user.userId])
    names.push(title)
  }
  await db().query('UPDATE services.jobs SET updated_at = now() WHERE id = $1', [id])
  await audit({ event, actorUserId: user.userId, action: 'services.team_upload', objectType: 'job', objectId: id, detail: { files: names.length, visible } })
  let emailed = false
  if (visible) {
    try {
      const to = await clientRecipients(j.client_id)
      const link = to.portal ? await portalUrl('/jobs/' + id, j.client_id) : await issueClientLink(id)
      const head = names.length === 1 ? 'A document has been shared with you' : names.length + ' documents have been shared with you'
      for (const e of to.portal ? to.emails : [j.email]) await sendJobUpdate(e, j.contact_name, j.title, head, [names.join(', '), note].filter(Boolean).join('\n\n'), link)
      emailed = true
    } catch (err) { console.error('[services] upload email failed for ' + id, err) }
  }
  return { ok: true, files: names.length, emailed }
})
