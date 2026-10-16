// Upload an Excel (.xlsx), CSV or PDF (a report or investor update). It is stored privately, read by AI, and the figures
// (and, for a written report, its highlights, challenges and asks) come back to prefill the form.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, { ext: 'xlsx' | 'csv' | 'pdf'; mime: string }> = {
  pdf: { ext: 'pdf', mime: 'application/pdf' },
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv: { ext: 'csv', mime: 'text/csv' }
}
export default defineEventHandler(async (event) => {
  const r = await requestFromToken(event)
  await rateLimit('report_upload', r.id, 10, 60 * 60 * 1000)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose an Excel, CSV or PDF file.')
  if (file.data.length > 20 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 20 MB.', 413)
  const t = TYPES[(file.filename ?? '').split('.').pop()?.toLowerCase() ?? '']
  if (!t) throw apiError('bad_type', 'Upload an Excel (.xlsx), CSV or PDF file. Older .xls files: save as .xlsx first.')
  const pdf = t.ext === 'pdf' ? Buffer.from(file.data) : undefined
  if (pdf && pdf.subarray(0, 5).toString() !== '%PDF-') throw apiError('unreadable', 'That file is not a readable PDF.')
  let text = ''
  if (!pdf) { try { text = await sheetToText(file.data, t.ext as 'xlsx' | 'csv') } catch { throw apiError('unreadable', 'We could not read that file. Check it opens in Excel, or type the numbers instead.') } }
  if (!pdf && !text.trim()) throw apiError('empty', 'That file looks empty.')
  // Keep the original file with the company's records
  const docId = randomUUID()
  const key = 'documents/' + docId + '.' + t.ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: t.mime })
  await db().query(
    `INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256)
     VALUES ($1,$2,'report','normal',$3,$4,$5,$6)`,
    [docId, r.company + ' — ' + (Number(r.months) === 3 ? requestLabel(r.period, 'quarterly') : periodLabel(r.period)) + ' report', key, t.mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  await db().query('UPDATE portfolio.requests SET file_document_id = $2 WHERE id = $1', [r.id, docId])
  try {
    const out = await extractMetrics(text, Number(r.months) === 3 ? requestLabel(r.period, 'quarterly') + ' (the whole quarter: revenue is the quarter total, net burn the average per month, balances at quarter end)' : periodLabel(r.period), 'portfolio.requests:' + r.id, pdf)
    const { notes, highlights, challenges, asks, ...values } = out
    return { ok: true, values, notes, update: { highlights: highlights ?? '', challenges: challenges ?? '', asks: asks ?? '' } }
  } catch (err) {
    console.error('[report] extraction failed for ' + r.id, err)
    throw apiError('extract_failed', 'We saved your file but could not read the numbers from it. Please type them in below.', 422)
  }
})
