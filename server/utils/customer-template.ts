// The Finvry customer revenue template, in the same shape as the financials template: the mark in A1, the headings on
// row 4, one row per customer (who they are on the left, then one column per month), and an Exchange rates tab with
// one row per currency and the months across. Finvry reads it by fixed rules, with no AI.
export const CUSTOMER_MARK = 'Finvry customer revenue template'
export interface TemplateCustomer { name: string; segment?: string; sector?: string; country?: string; plan?: string; started_on?: string; acquisition_cost?: number; currency: string; rev: Record<string, number> }
const ATTRS: [string, number][] = [['Customer', 34], ['Segment', 13], ['Sector', 22], ['Country', 13], ['Plan', 14], ['Start date', 12], ['Acquisition cost', 15], ['Currency', 10]]

export async function customerTemplateWorkbook(o: { months?: string[]; customers?: TemplateCustomer[]; rates?: Record<string, Record<string, number>>; title?: string; note?: string } = {}): Promise<Buffer> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); wb.creator = 'Finvry'
  const F = { name: 'Instrument Sans', size: 10.5 }, NAVY = 'FF0C1A2E', MUT = 'FF6E737B'
  const now = new Date(), y = now.getUTCFullYear()
  const months = o.months?.length ? o.months : Array.from({ length: 24 }, (_, k) => new Date(Date.UTC(y - 1, k, 1)).toISOString().slice(0, 7))
  const asDate = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1))
  const top = (ws: import('exceljs').Worksheet, a1: string, a2: string) => {
    ws.getCell('A1').value = a1; ws.getCell('A1').font = { ...F, bold: true, color: { argb: NAVY } }
    ws.getCell('A2').value = a2; ws.getCell('A2').font = { ...F, color: { argb: MUT } }
  }
  const header = (ws: import('exceljs').Worksheet, left: string[]) => {
    const hr = ws.getRow(4)
    left.forEach((h, i) => { hr.getCell(i + 1).value = h })
    months.forEach((m, k) => { const c = hr.getCell(left.length + k + 1); c.value = asDate(m); c.numFmt = 'mmm yyyy' })
    hr.font = { ...F, bold: true, color: { argb: 'FFFFFFFF' } }; hr.height = 20
    hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; c.alignment = { vertical: 'middle' } })
    months.forEach((_, k) => { ws.getColumn(left.length + k + 1).width = 12 })
  }

  const ws = wb.addWorksheet('Customers', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] })
  ATTRS.forEach(([, w], i) => { ws.getColumn(i + 1).width = w })
  top(ws, CUSTOMER_MARK + ' · v1', o.note ?? 'One row per customer. Revenue for each month in the customer\'s currency (the Currency column). Leave months with no revenue empty. Keep the headings as they are.')
  header(ws, ATTRS.map(([h]) => h))
  const sample: TemplateCustomer[] = [
    { name: 'Acme Bank', segment: 'Enterprise', sector: 'Financial services', country: 'Nigeria', plan: 'Platform', started_on: months[0] + '-01', acquisition_cost: 15000, currency: 'USD', rev: Object.fromEntries(months.slice(-3).map((m, i) => [m, 12000 + i * 500])) },
    { name: 'Bright Shop', segment: 'SMB', sector: 'Retail', country: 'Nigeria', plan: 'Starter', started_on: months[months.length - 3] + '-01', acquisition_cost: 800, currency: 'NGN', rev: Object.fromEntries(months.slice(-3).map((m, i) => [m, 1350000 + i * 50000])) }]
  const list = o.customers ?? sample
  let n = 5
  for (const c of list) {
    const r = ws.getRow(n)
    const vals: (string | number | Date | null)[] = [c.name, c.segment ?? null, c.sector ?? null, c.country ?? null, c.plan ?? null, c.started_on ? asDate(c.started_on.slice(0, 7)) : null, c.acquisition_cost ?? null, c.currency]
    vals.forEach((v, i) => { if (v !== null && v !== '') r.getCell(i + 1).value = v })
    if (c.started_on) r.getCell(6).numFmt = 'yyyy-mm-dd'
    r.getCell(7).numFmt = '#,##0.00'
    months.forEach((m, k) => { const v = c.rev[m]; if (v !== undefined && v !== 0) { const x = r.getCell(ATTRS.length + k + 1); x.value = v; x.numFmt = '#,##0.00' } })
    r.font = F
    n++
  }

  const fx = wb.addWorksheet('Exchange rates', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] })
  fx.getColumn(1).width = 14
  top(fx, 'Exchange rates · units of each currency per 1 USD', 'Units of each currency per 1 USD, one row per currency, by month (e.g. NGN 1,386). Only needed for currencies other than USD; months left empty use the latest daily rate.')
  header(fx, ['Currency'])
  const rates = o.rates ?? { NGN: Object.fromEntries(months.slice(-3).map((m) => [m, 1386])) }
  n = 5
  for (const [cur, by] of Object.entries(rates)) {
    const r = fx.getRow(n); r.getCell(1).value = cur; r.font = F
    months.forEach((m, k) => { const v = by[m]; if (v) { const x = r.getCell(k + 2); x.value = v; x.numFmt = '#,##0.00' } })
    n++
  }

  const g = wb.addWorksheet('How to use', { views: [{ showGridLines: false }] }); g.getColumn(1).width = 4; g.getColumn(2).width = 100
  const line = (t: string, s: { bold?: boolean; size?: number; color?: string } = {}) => { const r = g.addRow(['', t]); r.getCell(2).font = { ...F, bold: s.bold, size: s.size ?? 10.5, color: s.color ? { argb: s.color } : undefined }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' } }
  g.addRow([]); line(o.title ?? 'Finvry customer revenue template', { bold: true, size: 16, color: NAVY })
  line('For Revenue retention and Customers. Finvry reads this layout exactly, with no AI, so your figures come in the same way every time.', { color: MUT }); g.addRow([])
  for (const [h, t] of [
    ['1. One row per customer', 'Write each customer the same way on one row. Segment, Sector, Country, Plan, Start date and Acquisition cost are optional but make the customer analysis much richer (revenue by sector, CAC payback, cohorts).'],
    ['2. Months across', 'One column per month, revenue billed or earned that month in the customer\'s currency. Leave months with no revenue empty. Add months to the right as they close.'],
    ['3. Currency', 'USD, NGN, GBP… per customer. Amounts are converted to your reporting currency at the monthly rates on the Exchange rates tab (or the latest daily rate where a month has none).'],
    ['4. No totals or copies', 'No total rows, rankings or summary tabs: Finvry works out retention, churn, cohorts and concentration from these rows.'],
    ['5. Upload or link it', 'Upload the file under Revenue retention or Customers, or open it in Google Sheets, share it so anyone with the link can view it, and link it so it is read every day. At least 13 months gives year-on-year retention.']]) { line(h, { bold: true }); line(t); g.addRow([]) }
  return Buffer.from(await wb.xlsx.writeBuffer())
}
