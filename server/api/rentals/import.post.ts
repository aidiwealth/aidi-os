// Read Airbnb's monthly files (the Transaction history CSV and/or the Earnings report PDF) into a preview.
// Nothing is saved until the team confirms; both originals are kept as documents.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  rateLimit('rentals_import', user.userId, 30, 60 * 60 * 1000)
  const parts = (await readMultipartFormData(event)) ?? []
  const files = parts.filter((p) => p.filename && p.data.length)
  if (!files.length) throw apiError('invalid', 'Drop the Airbnb CSV and/or the Earnings report PDF.')
  if (files.some((f) => f.data.length > 20 * 1024 * 1024)) throw apiError('too_large', 'Files can be up to 20 MB.', 413)
  const csv = files.find((f) => /\.csv$/i.test(f.filename!)), pdfs = files.filter((f) => /\.pdf$/i.test(f.filename!)).slice(0, 6)
  if (!csv && !pdfs.length) throw apiError('bad_type', 'Upload Airbnb\'s Transaction history (CSV) and the Earnings report (PDF).')
  const ent = await havenEntityId()
  const rows = csv ? parseAirbnbCsv(csv.data.toString('utf8')) : []
  // Every Earnings report dropped in (e.g. last year's and this year's) is read and checked against its own period.
  const controls: Control[] = []
  for (const pdf of pdfs) { try { controls.push(await parseEarningsPdf(pdf.data, 'rentals:earnings')) } catch (e) { console.error('[rentals] pdf', e); throw apiError('unreadable', 'We could not read ' + pdf.filename + '. Use the Earnings report from Airbnb → Earnings → Get PDF report.', 422) } }
  const units = await allUnits()
  const { period, checks, unmatched } = importChecks(rows, units, controls)
  const existing = new Set((await db().query<{ dedupe: string }>('SELECT dedupe FROM rentals.transactions WHERE dedupe = ANY($1::text[])', [rows.map((r) => r.dedupe)])).rows.map((r) => r.dedupe))
  const locked = await lockedPeriods()
  const csvDoc = csv ? await storeFile(event, ent, 'Airbnb transactions ' + (period ?? ''), csv.filename!, csv.data, 'text/csv', user.userId) : null
  let pdfDoc: string | null = null
  for (const [i, pdf] of pdfs.entries()) { const c = controls[i]!; const id = await storeFile(event, ent, 'Airbnb earnings report ' + c.period_start + ' – ' + c.period_end, pdf.filename!, pdf.data, 'application/pdf', user.userId); pdfDoc ??= id }
  const months = [...new Set(rows.map((r) => r.txn_date.slice(0, 7)))].sort()
  const imp = await one<{ id: string }>('INSERT INTO rentals.imports (period, months, csv_document_id, pdf_document_id, parsed, control, checks, imported_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [period, months, csvDoc, pdfDoc, JSON.stringify({ rows }), controls.length ? JSON.stringify(controls) : null, JSON.stringify(checks), user.userId])
  const isNew = (r: AirRow) => !existing.has(r.dedupe) && !locked.has(r.txn_date.slice(0, 7))
  return { importId: imp.id, period, months, label: months.length > 1 ? monthLabel(months[0]!) + ' – ' + monthLabel(months[months.length - 1]!) : period ? monthLabel(period) : null, rows: rows.length, fresh: rows.filter(isNew).length, duplicates: rows.filter((r) => !isNew(r)).length,
    payouts: rows.filter((r) => /^payout$/i.test(r.type)).length, bookings: new Set(rows.filter((r) => /^reservation$/i.test(r.type)).map((r) => r.confirmation_code)).size,
    paid_out: Math.round(rows.filter((r) => /^payout$/i.test(r.type)).reduce((s, r) => s + (r.paid_out ?? 0), 0) * 100) / 100, control: controls[0] ?? null, reports: controls.length, checks, unmatched, locked: period ? locked.has(period) : false }
})
