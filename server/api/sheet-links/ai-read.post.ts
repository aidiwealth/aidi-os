// Start reading a workbook with AI. The read runs in the background (each tab is read separately; big models take a
// while) and the page follows it at /api/sheet-links/ai-read/<id>: progress, then the map (where each figure is), what
// it would bring in, other information found and figures worth adding; or, if it fails, why and what to do instead.
// Nothing is saved to Financials until the person links it.
// The workbook can also be uploaded (an Excel or CSV file) when a link cannot be used: it is read the same way, and
// its figures are brought in once (an uploaded file does not stay in step).
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await requireModule(event, 'financials')
  await rateLimit('sheet_ai', user.userId, 20, 60 * 60 * 1000)
  let upload: { buf: Buffer; ext: 'xlsx' | 'csv'; name: string; docId: string } | null = null, raw: Record<string, unknown>
  if ((getRequestHeader(event, 'content-type') ?? '').includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event)
    const file = parts?.find((x) => x.name === 'file' && x.filename), val = (k: string) => parts?.find((x) => x.name === k)?.data.toString() ?? ''
    const ext = (file?.filename ?? '').split('.').pop()?.toLowerCase()
    if (!file?.data.length || (ext !== 'xlsx' && ext !== 'csv')) throw apiError('invalid', 'Upload an Excel (.xlsx) or CSV file.')
    if (file.data.length > 15 * 1024 * 1024) throw apiError('too_large', 'That file is too large (15 MB maximum).', 413)
    const docId = randomUUID(), key = 'documents/' + docId + '.' + ext, mime = ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    await putObject({ key, body: new Uint8Array(file.data), contentType: mime }).catch((e: Error) => { console.error('[sheets] upload store', e.message); throw apiError('storage', 'Could not store the file just now. Try again in a minute.', 503) })
    await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','restricted',$3,$4,$5,$6)",
      [docId, 'Financial model — ' + (file.filename ?? 'workbook').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 120), key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
    upload = { buf: Buffer.from(file.data), ext, name: file.filename ?? 'workbook', docId }
    raw = { url: 'upload:' + upload.name, subject: val('subject'), currency: val('currency') || 'USD' }
  } else raw = await readBody(event)
  const b = z.object({ url: z.string().trim().min(10).max(600), subject: z.string().max(80), currency: z.string().regex(/^[A-Z]{3}$/).default('USD') }).safeParse(raw)
  if (!b.success) throw apiError('invalid', 'Paste the share link to the workbook, or upload the file.')
  if (!b.data.subject || b.data.subject === 'group') throw apiError('invalid', 'Choose the company or entity.')
  await db().query("DELETE FROM financials.sheet_reads WHERE created_at < now() - interval '1 day'")
  const id = (await one<{ id: string }>('INSERT INTO financials.sheet_reads (created_by) VALUES ($1) RETURNING id', [user.userId])).id
  const set = (stage: string, extra: Record<string, unknown> = {}) => db().query('UPDATE financials.sheet_reads SET stage = $2, progress = progress || $3::jsonb, updated_at = now() WHERE id = $1', [id, stage, JSON.stringify(extra)]).catch(() => {})
  const run = (async () => {
    let stage = 'fetch'
    try {
      const { buf, ext, provider } = upload ? { buf: upload.buf, ext: upload.ext, provider: 'Uploaded file' } : await fetchLinkedSheet(b.data.url)
      stage = 'parse'; await set('parse', { provider, bytes: buf.length })
      const grids = await readGrids(buf, ext, AI_GRID)
      if (!grids.some((g) => g.rows.some((r) => r.some((c) => c !== null)))) { stage = 'empty'; throw apiError('empty', 'That workbook looks empty.', 422) }
      stage = 'ai'; await set('ai', { tabs: grids.length, done: 0 })
      const map = await mapWorkbook(grids, b.data.currency, 'sheet:' + b.data.url.slice(0, 90), (done, total, sheet) => set('ai', { done, total, last: sheet }))
      const r = readWithMap(grids, map)
      if (!map.blocks.length && !map.facts.length) { stage = 'empty'; throw apiError('empty', 'No tables of figures were found in the workbook.', 422) }
      await db().query("UPDATE financials.sheet_reads SET status = 'done', stage = 'done', result = $2, updated_at = now() WHERE id = $1", [id, JSON.stringify({ provider, tabs: grids.map((g) => g.name), map, preview: previewOf(r), document_id: upload?.docId ?? null, file: upload?.name ?? null })])
    } catch (err) {
      console.error('[sheets] ai read', stage, (err as Error).message)
      await db().query("UPDATE financials.sheet_reads SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [id, JSON.stringify({ stage, ...explainSheetError(err, stage) })]).catch(() => {})
    }
  })()
  event.waitUntil?.(run)
  return { id }
})
