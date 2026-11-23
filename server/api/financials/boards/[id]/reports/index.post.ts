// Add a report to a board by uploading it (PDF or Excel, up to 25 MB). It is kept in Documents and attached to the board.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
const TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Board not found', 404)
  if (!(await db().query('SELECT 1 FROM financials.boards WHERE id = $1', [id.data])).rowCount) throw apiError('not_found', 'Board not found', 404)
  if (Number(getRequestHeader(event, 'content-length') ?? '0') > 26 * 1024 * 1024) throw apiError('too_large', 'Reports can be up to 25 MB.', 413)
  const f = (await readMultipartFormData(event))?.find((p) => p.name === 'file' && p.filename && p.data.length)
  if (!f) throw apiError('invalid', 'Choose a PDF or Excel file.')
  const name = f.filename!.replace(/[\\/]/g, '_').slice(0, 180), ext0 = (name.split('.').pop() ?? '').toLowerCase()
  const mime = TYPES[(f.type ?? '').split(';')[0]!.trim()] ? (f.type ?? '').split(';')[0]!.trim() : ext0 === 'pdf' ? 'application/pdf' : ext0 === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : ''
  if (!mime) throw apiError('bad_type', 'Use a PDF or Excel (.xlsx) file.')
  if (f.data.length > 25 * 1024 * 1024) throw apiError('too_large', 'Reports can be up to 25 MB.', 413)
  const docId = randomUUID(), key = 'documents/' + docId + '.' + TYPES[mime], title = name.replace(/\.[^.]+$/, '').slice(0, 200)
  await putObject({ key, body: new Uint8Array(f.data), contentType: mime })
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by) VALUES ($1,$2,'report','normal',$3,$4,$5,$6,$7)",
    [docId, title, key, mime, f.data.length, createHash('sha256').update(f.data).digest('hex'), user.userId])
  await db().query('UPDATE financials.boards SET documents = array_append(documents, $2::uuid), updated_at = now() WHERE id = $1', [id.data, docId])
  await audit({ event, actorUserId: user.userId, action: 'document.upload', objectType: 'document', objectId: docId, detail: { title, board: id.data } })
  return { ok: true, id: docId }
})
