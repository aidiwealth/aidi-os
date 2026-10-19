// Upload a workbook with the company's book rates: an Exchange rates / FX rates tab, either one row per currency with
// months across (the Finvry templates) or a month column and a rate column under a heading like "NGN per 1 USD".
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const f = (await readMultipartFormData(event))?.find((p) => p.name === 'file' && p.filename)
  if (!f) throw apiError('invalid', 'Choose a file.')
  const ext = (f.filename!.split('.').pop() ?? '').toLowerCase()
  if (ext !== 'xlsx' && ext !== 'csv') throw apiError('bad_type', 'Upload an Excel (.xlsx) or CSV file.')
  const grids = await readGrids(Buffer.from(f.data), ext, { tabs: 30, rows: 400, cols: 80 })
  const rates = fileRates(grids)
  if (!rates.size) throw apiError('unreadable', 'No exchange rates found. Use a tab named Exchange rates or FX rates: a month column and a rate column under a heading like "NGN per 1 USD", or one row per currency with months across.', 422)
  const n = await saveMonthlyRates(rates, 'upload')
  await db().query("DELETE FROM financials.analyses WHERE subject LIKE 'group%' OR subject LIKE 'customers:%' OR subject LIKE 'advice:%'").catch(() => {})
  await audit({ event, actorUserId: user.userId, action: 'financials.fx_upload', objectType: 'fx', detail: { months: n, file: f.filename } })
  return { ok: true, saved: n, currencies: [...rates.keys()] }
})
