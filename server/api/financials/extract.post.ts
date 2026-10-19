// Read an uploaded Excel, CSV or PDF statement (accounts or a bank statement) and propose standard lines for every period
// it covers. Nothing is saved until the user confirms.
import { createHash, randomUUID } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await rateLimit('fin_extract', user.userId, 30, 60 * 60 * 1000)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  const wanted = (parts?.find((p) => p.name === 'wanted')?.data.toString() ?? 'latest period').slice(0, 60)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a file.')
  if (file.data.length > 20 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 20 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase()
  if (ext !== 'xlsx' && ext !== 'csv' && ext !== 'pdf') throw apiError('bad_type', 'Upload an Excel (.xlsx), CSV or PDF file.')
  const pdf = ext === 'pdf' ? Buffer.from(file.data) : undefined
  if (pdf && pdf.subarray(0, 5).toString() !== '%PDF-') throw apiError('bad_type', 'That file is not a readable PDF.')
  const text = pdf ? '' : await sheetToText(Buffer.from(file.data), ext as 'xlsx' | 'csv')
  if (!pdf && text.trim().length < 20) throw apiError('empty', 'That file looks empty.')
  const mime = ext === 'pdf' ? 'application/pdf' : ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const docId = randomUUID(), key = 'documents/' + docId + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)",
    [docId, 'Financials — ' + (file.filename ?? 'statement').replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 120), key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  // Spreadsheets: read by their layout with no AI (the template, or months across and line names down a column), so
  // every month comes in exactly as typed. Only PDFs go to the statement reader, and every figure is checked in the form.
  if (!pdf) {
    const org = await currentOrg(), cur = String((org?.settings.reporting_currency as string | undefined) || (org?.settings.currency as string | undefined) || 'USD')
    const sp = await spreadsheetProposal(Buffer.from(file.data), ext as 'xlsx' | 'csv', /^[A-Z]{3}$/.test(cur) ? cur : 'USD', 'document:' + docId, wanted).catch((e) => { if ((e as { statusCode?: number }).statusCode === 429) throw e; console.error('[financials] sheet read', (e as Error).message); return null })
    if (sp) return { ...sp, document_id: docId }
    throw apiError('unreadable', 'We read spreadsheets by their layout, with no AI: put the months across one heading row and the line names down the first column, or use the Finvry template (Download the Finvry template, below).', 422)
  }
  try {
    const out = await extractStatement(text, wanted, 'document:' + docId, pdf)
    return { ...out, kpis: Object.fromEntries(out.kpis.map((k) => [k.name, k.value])), more_periods: out.more_periods.map((p) => ({ ...p, kpis: Object.fromEntries(p.kpis.map((k) => [k.name, k.value])) })), document_id: docId }
  } catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[financials] extract failed', err); throw apiError('ai_failed', 'Could not read that file automatically. Enter the figures by hand; the file is kept with the statement.', 422) }
})
