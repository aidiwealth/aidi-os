import type { ReadSheet } from '~/server/utils/forecast-import'
// Read a forecast file; returns the lines and where each belongs. Nothing is saved here.
// Spreadsheets (Excel, CSV) are read by fixed rules with no AI: the Finvry forecast template, or months across one
// heading row and line names down a column. A PDF can only be read with AI; the founder checks every line either way.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const parts = (await readMultipartFormData(event)) ?? []
  const files = parts.filter((p) => p.filename && p.data?.length).map((p) => ({ name: p.filename!.slice(0, 160), data: p.data }))
  if (!files.length) throw apiError('invalid', 'Choose the forecast file.')
  if (files.length > 3) throw apiError('invalid', 'Up to 3 files for one forecast.')
  const ext = (n: string) => (n.split('.').pop() ?? '').toLowerCase()
  const sc = await forecastScope(event)
  const company = sc.name || 'the company'
  let sheet: ReadSheet | null = null, how: 'rules' | 'ai' = 'rules'
  if (files.every((f) => ['xlsx', 'xlsm', 'csv'].includes(ext(f.name)))) {
    const grids = (await Promise.all(files.map((f) => readGrids(Buffer.from(f.data), ext(f.name) === 'csv' ? 'csv' : 'xlsx', { tabs: 30, rows: 400, cols: 80 })))).flat()
    sheet = forecastFromGrids(grids, (await forecastScope(event)).currency)
    if (!sheet) throw apiError('unreadable', 'We read forecasts by their layout, with no AI: use the Finvry forecast template (Download the template), or put the months across one heading row and these line names down the first column: Revenue, Cost of revenue, Payroll, Sales & marketing, General & admin.', 422)
  } else {
    how = 'ai'
    try { sheet = await readForecastFiles(files, company, 'forecast:' + (sc.entity ?? 'org')) }
    catch (e) { if ((e as { statusCode?: number }).statusCode) throw e; console.error('[forecast] read failed', e); throw apiError('ai_failed', 'Could not read that PDF just now. Try again, or put the forecast in the Finvry forecast template.', 502) }
  }
  if (!sheet.lines.some((l) => l.maps_to !== 'ignore' && l.values.length)) throw apiError('empty', 'No monthly figures found in that file.', 422)
  await audit({ event, actorUserId: user.userId, action: 'forecast.sheet_read', objectType: 'forecast', detail: { files: files.map((f) => f.name), lines: sheet.lines.length, how } })
  return { sheet, files: files.map((f) => f.name), how }
})
