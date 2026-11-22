// Founder documents on a pipeline deal (multipart: one or more "file" parts, optional "note"). Each file is filed in
// Documents under the deal's vehicle and added to the deal's timeline, so it stays on the company's record.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
const MAX_BYTES = 25 * 1024 * 1024, MAX_FILES = 10
const TYPES: Record<string, string> = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'text/csv': 'csv', 'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
}
const BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([m, e]) => [e, m]))
// A sensible Documents type from the file name; the team can change it in Documents.
const kindOf = (name: string, ext: string) => (ext === 'pptx' || /deck|pitch|presentation/i.test(name) ? 'deck'
  : /safe|term ?sheet|agreement|contract|shareholder|subscription|side letter/i.test(name) ? 'financing'
  : /financ|model|p&l|pnl|statement|budget|forecast|metrics|kpi|report|update/i.test(name) ? 'report'
  : /incorporat|certificate|bylaws|articles|cac|memorandum/i.test(name) ? 'legal' : 'other')
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Deal not found', 404)
  const deal = (await db().query<{ company: string; vehicle_entity_id: string | null }>('SELECT company, vehicle_entity_id FROM deals.deals WHERE id = $1', [id.data])).rows[0]
  if (!deal) throw apiError('not_found', 'Deal not found', 404)
  const len = Number(getRequestHeader(event, 'content-length') ?? '0')
  if (len > MAX_FILES * MAX_BYTES + 1024 * 1024) throw apiError('too_large', 'Upload up to ' + MAX_FILES + ' files of 25 MB each at a time.', 413)
  const parts = await readMultipartFormData(event)
  const files = (parts ?? []).filter((p) => p.name === 'file' && p.filename && p.data.length)
  if (!files.length) throw apiError('invalid', 'Drop the founder\'s files here.')
  if (files.length > MAX_FILES) throw apiError('invalid', 'Upload up to ' + MAX_FILES + ' files at a time.')
  const note = (parts ?? []).find((p) => p.name === 'note' && !p.filename)?.data.toString('utf8').trim().slice(0, 500) || 'Shared by the founder'
  // Check every file before storing any, so a bad one does not leave half an upload.
  const ready = files.map((f) => {
    const name = f.filename!.replace(/[\\/]/g, '_').slice(0, 180)
    const fromName = (name.split('.').pop() ?? '').toLowerCase()
    let mime = (f.type ?? '').split(';')[0]!.trim().toLowerCase()
    if (!TYPES[mime] && BY_EXT[fromName]) mime = BY_EXT[fromName]!
    const ext = TYPES[mime]
    if (!ext) throw apiError('bad_type', name + ': use PDF, Word, Excel, PowerPoint, CSV, text or an image.')
    if (f.data.length > MAX_BYTES) throw apiError('too_large', name + ' is over 25 MB.', 413)
    return { f, name, mime, ext }
  })
  const out: { id: string; title: string }[] = []
  for (const { f, name, mime, ext } of ready) {
    const docId = randomUUID(), key = 'documents/' + docId + '.' + ext
    const title = (deal.company + ' - ' + name.replace(/\.[^.]+$/, '')).slice(0, 200)
    const sha256 = createHash('sha256').update(f.data).digest('hex')
    await putObject({ key, body: new Uint8Array(f.data), contentType: mime })
    await db().query(`INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by)
      VALUES ($1,$2,$3,$4,'normal',$5,$6,$7,$8,$9)`, [docId, deal.vehicle_entity_id, title, kindOf(name, ext), key, mime, f.data.length, sha256, user.userId])
    await db().query("INSERT INTO deals.deal_events (deal_id, kind, body, document_id, created_by) VALUES ($1, 'document', $2, $3, $4)", [id.data, note, docId, user.userId])
    await audit({ event, actorUserId: user.userId, action: 'document.upload', objectType: 'document', objectId: docId, entityId: deal.vehicle_entity_id ?? undefined, detail: { title, deal: id.data, size: f.data.length, sha256 } })
    out.push({ id: docId, title })
  }
  return { ok: true, documents: out }
})
