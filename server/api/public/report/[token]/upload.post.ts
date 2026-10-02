// Upload an Excel (.xlsx) or CSV file. It is stored privately, read by AI, and the figures come back to prefill the form.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, { ext: 'xlsx' | 'csv'; mime: string }> = {
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv: { ext: 'csv', mime: 'text/csv' }
}
export default defineEventHandler(async (event) => {
  const r = await requestFromToken(event)
  rateLimit('report_upload', r.id, 10, 60 * 60 * 1000)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose an Excel (.xlsx) or CSV file.')
  if (file.data.length > 10 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 10 MB.', 413)
  const t = TYPES[(file.filename ?? '').split('.').pop()?.toLowerCase() ?? '']
  if (!t) throw apiError('bad_type', 'Upload an Excel (.xlsx) or CSV file. Older .xls files: save as .xlsx first.')
  let text: string
  try { text = await sheetToText(file.data, t.ext) } catch { throw apiError('unreadable', 'We could not read that file. Check it opens in Excel, or type the numbers instead.') }
  if (!text.trim()) throw apiError('empty', 'That file looks empty.')
  // Keep the original file with the company's records
  const docId = randomUUID()
  const key = 'documents/' + docId + '.' + t.ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: t.mime })
  await db().query(
    `INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256)
     VALUES ($1,$2,'report','normal',$3,$4,$5,$6)`,
    [docId, r.company + ' — ' + periodLabel(r.period) + ' report', key, t.mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  await db().query('UPDATE portfolio.requests SET file_document_id = $2 WHERE id = $1', [r.id, docId])
  try {
    const out = await extractMetrics(text, periodLabel(r.period), 'portfolio.requests:' + r.id)
    const { notes, ...values } = out
    return { ok: true, values, notes }
  } catch (err) {
    console.error('[report] extraction failed for ' + r.id, err)
    throw apiError('extract_failed', 'We saved your file but could not read the numbers from it. Please type them in below.', 422)
  }
})
