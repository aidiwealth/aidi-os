// Upload one past report (a PDF, read by AI, or the Aidi portfolio report template, read with no AI): store it in
// Documents under the holding company. Nothing is saved
// to the company's figures until a person approves it (reports/save).
import { createHash } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await rateLimit('portfolio_report', user.userId, 120, 60 * 60 * 1000)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Company not found', 404)
  const c = (await db().query<{ name: string; holding_entity_id: string | null }>('SELECT name, holding_entity_id FROM portfolio.companies WHERE id = $1', [id.data])).rows[0]
  if (!c) throw apiError('not_found', 'Company not found', 404)
  const file = ((await readMultipartFormData(event)) ?? []).find((p) => p.name === 'file' && p.filename && p.data.length)
  if (!file) throw apiError('invalid', 'Choose a report (PDF, or the Aidi portfolio report template).')
  if (file.data.length > 25 * 1024 * 1024) throw apiError('too_large', 'Reports can be up to 25 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  const sheet = ext === 'xlsx' || ext === 'csv'
  if (!sheet && file.data.subarray(0, 4).toString('latin1') !== '%PDF') throw apiError('bad_type', 'Upload the report as a PDF, or the Aidi portfolio report template (Excel).')
  const sha = createHash('sha256').update(file.data).digest('hex')
  const dup = (await db().query<{ title: string; imported_at: string }>("SELECT r.title, to_char(r.imported_at, 'YYYY-MM-DD') AS imported_at FROM portfolio.report_imports r JOIN core.documents d ON d.id = r.document_id WHERE r.company_id = $1 AND d.sha256 = $2 LIMIT 1", [id.data, sha])).rows[0]
  let extracted: ExtractedReport
  // The Aidi portfolio report template is read by its line names, with no AI; a PDF is read with AI.
  if (sheet) {
    const t = readPortfolioTemplate(await readGrids(Buffer.from(file.data), ext as 'xlsx' | 'csv'), c.name)
    if (!t) throw apiError('unreadable', 'Spreadsheets are read in the Aidi portfolio report template only (Report template, above). Put the figures in it, or upload the report as a PDF.', 422)
    extracted = t
  } else {
    try { extracted = await readReport(Buffer.from(file.data), c.name, 'portfolio:' + id.data) }
    catch (err) { console.error('[portfolio report] AI failed', err); throw apiError('ai_failed', 'Could not read this report just now. Try again, or check it is a readable PDF.', 502) }
  }
  const docId = await storeFile(event, c.holding_entity_id, c.name + ' — ' + extracted.title, file.filename!, Buffer.from(file.data), sheet ? (ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') : 'application/pdf', user.userId, 'report')
  const rate = extracted.currency === 'USD' ? 1 : extracted.usd_rate ?? await fxRate('USD', extracted.currency)
  return { document_id: docId, filename: file.filename, extracted, rate, rate_source: extracted.currency === 'USD' ? 'usd' : extracted.usd_rate ? 'report' : rate ? 'today' : 'none', duplicate: dup ?? null }
})
