// Upload an Excel (.xlsx), CSV or PDF (a report or investor update). It is stored privately, read by AI, and the figures
// (and, for a written report, its highlights, challenges and asks) come back to prefill the form.
import { createHash, randomUUID } from 'node:crypto'
const TYPES: Record<string, { ext: 'xlsx' | 'csv' | 'pdf'; mime: string }> = {
  pdf: { ext: 'pdf', mime: 'application/pdf' },
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv: { ext: 'csv', mime: 'text/csv' }
}
const t0 = (e: string) => (e === 'csv' ? 'csv' : 'xlsx') as 'xlsx' | 'csv'
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
  // The Aidi portfolio report template: read by line names, with no AI, for the period asked for.
  if (!pdf) {
    const tm = readPortfolioTemplate(await readGrids(Buffer.from(file.data), t0(t.ext)), r.company)
    if (tm) {
      const t = tm
      const end = String(r.period).slice(0, 7), n = Number(r.months) === 3 ? 3 : 1, ms = Array.from({ length: n }, (_, i) => { const d = new Date(end + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7) })
      const at = (m: string) => t.periods.find((p) => p.month === m), lastP = at(end) ?? t.periods.filter((p) => ms.includes(p.month)).pop()
      if (lastP || ms.some(at)) {
        const sumRev = lastP && lastP.months_covered >= n ? lastP.revenue_total : ms.every((m) => at(m)?.revenue_total != null) ? ms.reduce((s, m) => s + at(m)!.revenue_total!, 0) : null
        const burns = ms.map((m) => at(m)?.net_burn_monthly).filter((x): x is number => x != null)
        const values = { revenue: sumRev, gross_margin: lastP?.gross_margin_pct ?? null, net_burn: lastP && lastP.months_covered >= n ? lastP.net_burn_monthly : burns.length ? Math.round(burns.reduce((s, x) => s + x, 0) / burns.length) : null, cash: lastP?.cash ?? null, customers: lastP?.customers ?? null, headcount: lastP?.headcount ?? null }
        // The form is in US dollars: other currencies are converted at today's rate (the founder can correct them).
        const rate = t.currency === 'USD' ? 1 : await fxRate('USD', t.currency).catch(() => null)
        if (rate && rate !== 1) for (const k of ['revenue', 'net_burn', 'cash'] as const) { const v = values[k]; if (v != null) values[k] = Math.round(v / rate) }
        return { ok: true, values, notes: 'Read from the Aidi portfolio report template.' + (t.currency !== 'USD' ? (rate ? ' ' + t.currency + ' converted to US dollars at today\'s rate; check the amounts.' : ' Amounts are in ' + t.currency + ': convert them to US dollars below.') : ''), update: { highlights: t.highlights, challenges: t.challenges, asks: t.asks } }
      }
    }
  }
  try {
    const out = await extractMetrics(text, Number(r.months) === 3 ? requestLabel(r.period, 'quarterly') + ' (the whole quarter: revenue is the quarter total, net burn the average per month, balances at quarter end)' : periodLabel(r.period), 'portfolio.requests:' + r.id, pdf)
    const { notes, highlights, challenges, asks, ...values } = out
    return { ok: true, values, notes, update: { highlights: highlights ?? '', challenges: challenges ?? '', asks: asks ?? '' } }
  } catch (err) {
    console.error('[report] extraction failed for ' + r.id, err)
    throw apiError('extract_failed', 'We saved your file but could not read the numbers from it. Please type them in below.', 422)
  }
})
