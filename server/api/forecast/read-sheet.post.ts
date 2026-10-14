// Read an accountant's forecast file(s) with AI; returns the lines and where each belongs. Nothing is saved here.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const parts = (await readMultipartFormData(event)) ?? []
  const files = parts.filter((p) => p.filename && p.data?.length).map((p) => ({ name: p.filename!.slice(0, 160), data: p.data }))
  if (files.length > 3) throw apiError('invalid', 'Up to 3 files for one forecast.')
  const company = (await currentOrg())?.name ?? 'the company'
  let sheet
  try { sheet = await readForecastFiles(files, company, 'forecast:' + (await companyEntityId() ?? 'org')) }
  catch (e) { if ((e as { statusCode?: number }).statusCode) throw e; console.error('[forecast] read failed', e); throw apiError('ai_failed', 'Could not read that forecast just now. Try again, or export the monthly P&L sheet on its own.', 502) }
  if (!sheet.lines.some((l) => l.maps_to !== 'ignore' && l.values.length)) throw apiError('empty', 'No monthly figures found in that file.', 422)
  await audit({ event, actorUserId: user.userId, action: 'forecast.sheet_read', objectType: 'forecast', detail: { files: files.map((f) => f.name), lines: sheet.lines.length } })
  return { sheet, files: files.map((f) => f.name) }
})
