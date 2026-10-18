// The customer revenue kit: a simple workbook to fill in (or to keep as a live Google Sheet). One tab of rows (one per
// customer per month, any currency), one tab of exchange rates if more than one currency is used, and a short guide.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); wb.creator = 'Finvry'
  const F = { name: 'Instrument Sans', size: 10.5 }, NAVY = 'FF0C1A2E', SOFT = 'FFF4F6FA'
  const head = (ws: import('exceljs').Worksheet, cols: [string, number][]) => {
    cols.forEach(([, w], i) => { ws.getColumn(i + 1).width = w })
    const r = ws.addRow(cols.map(([h]) => h)); r.font = { ...F, bold: true, color: { argb: 'FFFFFFFF' } }; r.height = 20
    r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; c.alignment = { vertical: 'middle' } })
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  const g = wb.addWorksheet('Read me', { views: [{ showGridLines: false }] }); g.getColumn(1).width = 4; g.getColumn(2).width = 100
  const line = (t: string, o: { bold?: boolean; size?: number; color?: string } = {}) => { const r = g.addRow(['', t]); r.getCell(2).font = { ...F, bold: o.bold, size: o.size ?? 10.5, color: o.color ? { argb: o.color } : undefined }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' } }
  g.addRow([]); line('Customer revenue kit', { bold: true, size: 16, color: NAVY }); line('For Revenue retention and Customers in Finvry. Upload this file, or keep it in Google Sheets and link it so it is read every day.', { color: 'FF6E737B' }); g.addRow([])
  line('1. Customers tab', { bold: true }); line('One row per customer per month: Customer, Month, Revenue. Currency only if you bill in more than one. Segment, Sector, Country, Plan, Start date and Acquisition cost are optional; fill them once per customer (any row).'); g.addRow([])
  line('2. Exchange rates tab (only with more than one currency)', { bold: true }); line('Month, Currency, Rate per 1 USD (e.g. 2026-01, NGN, 1,386). Months without a rate use the latest daily rate.'); g.addRow([])
  line('Keep it simple', { bold: true })
  for (const t of ['One table per tab, headings in the first row, no merged cells.', 'Write each customer the same way every month. Finvry flags names that look alike (e.g. "Wema Bank" and "WEMA BANK PLC") for you to merge.', 'No totals rows, rankings or copies of the data: Finvry works those out.', 'At least 13 months gives year-on-year retention.']) line('•  ' + t)
  const c = wb.addWorksheet('Customers')
  head(c, [['Customer', 30], ['Month', 12], ['Revenue', 14], ['Currency', 10], ['Segment', 14], ['Sector', 20], ['Country', 14], ['Plan', 14], ['Start date', 12], ['Acquisition cost', 16]])
  for (const r of [['Acme Bank', '2026-01', 12000, 'USD', 'Enterprise', 'Financial services', 'Nigeria', 'Platform', '2024-03-01', 15000], ['Acme Bank', '2026-02', 12500, 'USD'], ['Bright Shop', '2026-01', 1350000, 'NGN', 'SMB', 'Retail', 'Nigeria', 'Starter', '2025-11-15', 800], ['Bright Shop', '2026-02', 1400000, 'NGN']]) { const row = c.addRow(r); row.font = F; row.getCell(3).numFmt = '#,##0.00' }
  c.eachRow((r, i) => { if (i > 1 && i % 2 === 1) r.eachCell({ includeEmpty: true }, (x) => { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } } }) })
  const x = wb.addWorksheet('Exchange rates')
  head(x, [['Month', 12], ['Currency', 10], ['Rate per 1 USD', 16]])
  for (const r of [['2026-01', 'NGN', 1386], ['2026-02', 'NGN', 1392]]) { const row = x.addRow(r); row.font = F; row.getCell(3).numFmt = '#,##0.00' }
  setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'content-disposition', 'attachment; filename="finvry-customer-revenue-kit.xlsx"')
  return Buffer.from(await wb.xlsx.writeBuffer())
})
