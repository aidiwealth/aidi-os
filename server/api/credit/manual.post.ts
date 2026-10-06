// Manual credit score for a business or a guarantor (countries without a connected bureau, e.g. the US), with the
// bureau report (Equifax, Experian, TransUnion, FICO, Credit Karma…) uploaded and kept on record.
import { createHash, randomUUID } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const parts = (await readMultipartFormData(event)) ?? []
  const val = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8').trim() ?? ''
  const borrowerId = val('borrower_id'), guarantorId = val('guarantor_id') || null, source = val('source').slice(0, 60), note = val('note').slice(0, 1000)
  const score = val('score') ? Number(val('score')) : null
  if (!/^[0-9a-f-]{36}$/.test(borrowerId) || (guarantorId && !/^[0-9a-f-]{36}$/.test(guarantorId))) throw apiError('invalid', 'Invalid request.')
  if (score != null && (!Number.isInteger(score) || score < 300 || score > 850)) throw apiError('invalid', 'Enter a score between 300 and 850.')
  const file = parts.find((p) => p.name === 'file' && p.filename && p.data.length)
  if (score == null && !file) throw apiError('invalid', 'Enter the score, upload the report, or both.')
  if (guarantorId && !(await db().query('SELECT 1 FROM credit.guarantors WHERE id = $1 AND borrower_id = $2', [guarantorId, borrowerId])).rowCount) throw apiError('not_found', 'Not found', 404)
  let docId: string | null = null
  if (file) {
    if (file.data.length > 20 * 1024 * 1024) throw apiError('too_large', 'Reports can be up to 20 MB.', 413)
    const mime = file.type || 'application/octet-stream'
    if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(mime)) throw apiError('bad_type', 'Upload the report as a PDF or an image.')
    docId = randomUUID(); const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]
    const key = 'documents/' + docId + '.' + ext, name = 'Credit report — ' + (file.filename ?? 'report').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150)
    await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
    await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','restricted',$3,$4,$5,$6)", [docId, name, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  }
  const band = bandOf(score)
  await db().query("INSERT INTO credit.checks (borrower_id, guarantor_id, provider, kind, status, score, band, summary, note, source, document_id, created_by) VALUES ($1,$2,'manual',$3,'manual',$4,$5,'{}'::jsonb,$6,$7,$8,$9)",
    [borrowerId, guarantorId, guarantorId ? 'individual' : 'business', score, band, note || (source ? source + ' report' : 'Manual review'), source || null, docId, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'credit.manual_score', objectType: guarantorId ? 'guarantor' : 'borrower', objectId: guarantorId ?? borrowerId })
  return { ok: true, score, band }
})
