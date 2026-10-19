// Reads a shared sheet and shows what can be linked: each tab with months across the columns, its rows (with the
// latest figures) and a suggested place for each row. Nothing is saved (an uploaded file is kept, unread, until imported).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await rateLimit('sheet_link', user.userId, 60, 60 * 60 * 1000)
  // Or an uploaded file (Excel or CSV): kept so the chosen rows can be brought in once (rows-import).
  const up = (getRequestHeader(event, 'content-type') ?? '').includes('multipart/form-data') ? await storeSheetUpload(event) : null
  const b = z.object({ url: z.string().trim().min(10).max(600), target: z.enum(['financials', 'forecast']) }).safeParse(up ? { url: 'upload:' + up.name, target: up.fields.target || 'financials' } : await readBody(event))
  if (!b.success) throw apiError('invalid', 'Paste the share link to the sheet, or upload the file.')
  if (up && b.data.target !== 'financials') throw apiError('invalid', 'Forecasts are kept in step with a link. Paste the share link instead.')
  await requireModule(event, b.data.target === 'forecast' ? 'forecast' : 'financials')
  const { buf, ext, provider } = up ? { buf: up.buf, ext: up.ext, provider: 'Uploaded file' } : await fetchLinkedSheet(b.data.url)
  const lays = layouts(await readGrids(buf, ext))
  if (!lays.length) throw apiError('empty', 'No months found across the columns. Put the months in one heading row (e.g. Jan 2026, Feb 2026) and line names down the first column.', 422)
  return { provider, document_id: up?.docId ?? null, file: up?.name ?? null, keys: TARGET_KEYS[b.data.target](),
    sheets: lays.map((l) => ({ sheet: l.sheet, months: l.months, rows: l.rows.slice(0, 150).map((r) => { const ms = Object.keys(r.values).sort(); const last = ms[ms.length - 1]!; return { label: r.label, last_month: last, last_value: r.values[last], months: ms.length } }),
      suggestion: suggestMapping(l.rows.slice(0, 150), b.data.target) })) }
})
