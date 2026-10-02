// Upload one document (multipart form: file, title, kind, sensitivity, entity_id). Max 25 MB; office, PDF, image, CSV and text files only.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'

const MAX_BYTES = 25 * 1024 * 1024
const TYPES: Record<string, string> = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'text/csv': 'csv', 'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
}
const Meta = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['agreement', 'statement', 'tax', 'insurance', 'legal', 'report', 'deck', 'other']),
  sensitivity: z.enum(['normal', 'family', 'restricted']),
  entity_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined))
})

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family')
  const len = Number(getRequestHeader(event, 'content-length') ?? '0')
  if (len > MAX_BYTES + 1024 * 1024) throw apiError('too_large', 'Files can be up to 25 MB.', 413)
  const parts = await readMultipartFormData(event)
  if (!parts) throw apiError('invalid', 'Choose a file to upload.')
  const field = (n: string): string | undefined => parts.find((p) => p.name === n && !p.filename)?.data.toString('utf8')
  const file = parts.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a file to upload.')
  if (file.data.length > MAX_BYTES) throw apiError('too_large', 'Files can be up to 25 MB.', 413)
  const mime = (file.type ?? '').split(';')[0]!.trim().toLowerCase()
  const ext = TYPES[mime]
  if (!ext) throw apiError('bad_type', 'That file type is not allowed. Use PDF, Word, Excel, PowerPoint, CSV, text or an image.')
  const meta = Meta.safeParse({ title: field('title'), kind: field('kind'), sensitivity: field('sensitivity'), entity_id: field('entity_id') })
  if (!meta.success) throw apiError('invalid', 'Add a title, type and sensitivity.')
  if (!canSee(user.roles, meta.data.sensitivity)) throw apiError('forbidden', 'You cannot file documents at that sensitivity.', 403)
  if (meta.data.entity_id) {
    const e = await db().query('SELECT 1 FROM core.entities WHERE id = $1', [meta.data.entity_id])
    if (e.rowCount !== 1) throw apiError('invalid', 'Unknown entity.')
  }
  const id = randomUUID()
  const sha256 = createHash('sha256').update(file.data).digest('hex')
  const key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  await db().query(
    `INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, meta.data.entity_id ?? null, meta.data.title, meta.data.kind, meta.data.sensitivity, key, mime, file.data.length, sha256, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'document.upload', objectType: 'document', objectId: id, entityId: meta.data.entity_id,
    detail: { title: meta.data.title, sensitivity: meta.data.sensitivity, size: file.data.length, sha256 } })
  return { ok: true, id }
})
