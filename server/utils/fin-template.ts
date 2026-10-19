// The Finvry financials template: one tab with the months across and Finvry's own line names down the side (profit
// and loss, balance sheet, cash flow, KPIs), totals worked out by formulas. A sheet made from it is recognised by the
// mark in A1 and read by fixed rules, with no AI, so it gives the same answer every time.
import type { Grid } from './sheet-links'
import type { AiMapT } from './sheet-ai'

export const TEMPLATE_MARK = 'Finvry financials template'
type Row = { label: string; f?: (c: string, r: Record<string, number>) => string; note?: string } | { head: string }
// Labels match Finvry's standard lines exactly (see SYN in sheet-links.ts).
export const TEMPLATE_ROWS: Row[] = [
  { head: 'PROFIT AND LOSS (for the month)' },
  { label: 'Revenue' }, { label: 'Cost of revenue', note: 'Direct costs of what you sell: hosting, carrier fees, payment fees, the cost of goods' },
  { label: 'Gross profit', f: (c, r) => `${c}${r.Revenue}-${c}${r['Cost of revenue']}` },
  { label: 'Payroll' }, { label: 'Sales and marketing' }, { label: 'Research and development' }, { label: 'General and administrative' },
  { label: 'Other operating costs', note: 'Add your own cost lines above this row; they are kept as your categories' },
  { label: 'Total operating costs', f: (c, r) => `SUM(${c}${r.Payroll}:${c}${r['Other operating costs']})` },
  { label: 'EBITDA', f: (c, r) => `${c}${r['Gross profit']}-${c}${r['Total operating costs']}` },
  { label: 'Depreciation and amortisation' }, { label: 'Interest expense' }, { label: 'Other income', note: 'Interest and dividends earned, FX gains (losses as negative)' }, { label: 'Tax' },
  { label: 'Net income', f: (c, r) => `${c}${r.EBITDA}-${c}${r['Depreciation and amortisation']}-${c}${r['Interest expense']}+${c}${r['Other income']}-${c}${r.Tax}` },
  { head: 'BALANCE SHEET (at the end of the month)' },
  { label: 'Cash', note: 'Bank balances' }, { label: 'Short-term investments', note: 'Treasury bills, fixed deposits, money market' }, { label: 'Receivables' },
  { label: 'Other assets', note: 'Prepayments, equipment, loans given, deposits' }, { label: 'Long-term investments', note: 'Stakes in other companies' },
  { label: 'Total assets', f: (c, r) => `SUM(${c}${r.Cash}:${c}${r['Long-term investments']})` },
  { label: 'Payables' }, { label: 'Debt' }, { label: 'Other liabilities', note: 'Accrued costs, taxes owed, customer prepayments' },
  { label: 'Total liabilities', f: (c, r) => `SUM(${c}${r.Payables}:${c}${r['Other liabilities']})` },
  { label: 'Total equity', note: 'Share capital, reserves and retained earnings together' },
  { label: 'Check: assets less liabilities and equity (should be 0)', f: (c, r) => `${c}${r['Total assets']}-${c}${r['Total liabilities']}-${c}${r['Total equity']}` },
  { head: 'CASH FLOW (optional)' },
  { label: 'Operating cash flow' }, { label: 'Investing cash flow' }, { label: 'Financing cash flow', note: 'Money raised or loans drawn (positive), repaid (negative)' },
  { head: 'KEY METRICS (one per row, starting with "KPI:")' },
  { label: 'KPI: Paying customers' }, { label: 'KPI: Headcount' }, { label: 'KPI: ' }]

// The workbook: the template tab (24 months, last January to this December) and a short guide.
export async function templateWorkbook(currency: string): Promise<Buffer> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); wb.creator = 'Finvry'
  const F = { name: 'Instrument Sans', size: 10.5 }, NAVY = 'FF0C1A2E', MUT = 'FF6E737B', SOFT = 'FFF4F6FA'
  const ws = wb.addWorksheet('Financials', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: true }] })
  const y = new Date().getUTCFullYear(), months = Array.from({ length: 24 }, (_, k) => new Date(Date.UTC(y - 1, k, 1)))
  ws.getColumn(1).width = 46
  months.forEach((_, k) => { ws.getColumn(k + 2).width = 13 })
  ws.getCell('A1').value = TEMPLATE_MARK + ' · v1'; ws.getCell('A1').font = { ...F, bold: true, color: { argb: NAVY } }
  ws.getCell('A2').value = 'Amounts in ' + currency + '. Fill the white cells; grey totals add up by themselves. Keep the line names as they are.'; ws.getCell('A2').font = { ...F, color: { argb: MUT } }
  const hr = ws.getRow(4); hr.getCell(1).value = 'Line'
  months.forEach((d, k) => { const c = hr.getCell(k + 2); c.value = d; c.numFmt = 'mmm yyyy' })
  hr.font = { ...F, bold: true, color: { argb: 'FFFFFFFF' } }; hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } } })
  // Row numbers first, so formulas can refer to the rows by name.
  const at: Record<string, number> = {}; let n = 5
  for (const r of TEMPLATE_ROWS) { if ('label' in r) at[r.label] = n; n++ }
  n = 5
  for (const r of TEMPLATE_ROWS) {
    const row = ws.getRow(n)
    if ('head' in r) { row.getCell(1).value = r.head; row.getCell(1).font = { ...F, bold: true, color: { argb: NAVY } }; row.height = 22 }
    else {
      row.getCell(1).value = r.label; row.getCell(1).font = { ...F, bold: !!r.f }
      if (r.note) row.getCell(1).note = r.note
      months.forEach((_, k) => {
        const c = row.getCell(k + 2), col = ws.getColumn(k + 2).letter
        c.numFmt = '#,##0;(#,##0);"-"'; c.font = F
        if (r.f) { c.value = { formula: r.f(col, at) } as never; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }; c.font = { ...F, bold: true } }
      })
    }
    n++
  }
  // Exchange rates: for a subsidiary in another currency, the rates its books use, so the group view converts each
  // month at that month's rate (saved as the company's monthly rates) instead of today's.
  const fx = wb.addWorksheet('Exchange rates', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] })
  fx.getColumn(1).width = 14; months.forEach((_, k) => { fx.getColumn(k + 2).width = 13 })
  fx.getCell('A1').value = 'Exchange rates · units of each currency per 1 USD'; fx.getCell('A1').font = { ...F, bold: true, color: { argb: NAVY } }
  fx.getCell('A2').value = 'Optional. One row per currency, by month (e.g. NGN 1,386). Used to convert subsidiaries for the group view; months left empty use the latest daily rate.'; fx.getCell('A2').font = { ...F, color: { argb: MUT } }
  const fh = fx.getRow(4); fh.getCell(1).value = 'Currency'
  months.forEach((d, k) => { const c = fh.getCell(k + 2); c.value = d; c.numFmt = 'mmm yyyy' })
  fh.font = { ...F, bold: true, color: { argb: 'FFFFFFFF' } }; fh.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } } })
  const fr = fx.getRow(5); fr.getCell(1).value = currency === 'USD' ? 'NGN' : currency; fr.font = F
  months.forEach((_, k) => { fr.getCell(k + 2).numFmt = '#,##0.00' })
  const g = wb.addWorksheet('How to use', { views: [{ showGridLines: false }] }); g.getColumn(1).width = 4; g.getColumn(2).width = 100
  const line = (t: string, o: { bold?: boolean; size?: number; color?: string } = {}) => { const r = g.addRow(['', t]); r.getCell(2).font = { ...F, bold: o.bold, size: o.size ?? 10.5, color: o.color ? { argb: o.color } : undefined }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' } }
  g.addRow([]); line('Finvry financials template', { bold: true, size: 16, color: NAVY })
  line('Finvry reads this layout exactly, with no AI, so your figures come in the same way every time.', { color: MUT }); g.addRow([])
  for (const [h, t] of [
    ['1. Fill in the months', 'One column per month. Costs as positive numbers; net income, other income and cash flows keep their sign. Leave months you have not closed yet empty.'],
    ['2. Keep the line names', 'Finvry knows each line by its name. To add your own cost lines (Consultants, Software…), insert rows above "Other operating costs"; to add asset or liability lines, insert them inside those sections. They are kept as your categories and added up for you.'],
    ['3. The balance sheet must balance', 'The "Check" row should be 0 every month. If it is not, a figure is missing or in the wrong line.'],
    ['4. Key metrics', 'One per row, starting with "KPI:" (KPI: Paying customers, KPI: Headcount, KPI: Messages sent…).'],
    ['5. Group companies', 'If you have subsidiaries, name what the companies owe each other "Intercompany receivable – <company>" (in Other assets) and "Intercompany payable – <company>" (in Other liabilities), and fees between them "Intercompany …". The group view takes them out. For a subsidiary in another currency, fill the Exchange rates tab.'],
    ['6. Link it', 'Upload the file to Google Drive and open it with Google Sheets (or keep it in Excel online), share it so anyone with the link can view it, and link it in Financials. It is read every day. You can also drop the file in once instead.']]) { line(h, { bold: true }); line(t); g.addRow([]) }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

// A sheet made from the template, mapped by fixed rules (no AI): the month columns from the heading row, each line by
// its name (your own rows inside a section become categories), and "KPI:" rows as metrics.
export function templateMap(grids: Grid[], currency: string): AiMapT | null { return mapByNames(grids, currency, true) }
// Any workbook with months across one heading row and line names down column A (or the first text column), read by
// the same fixed rules: no AI. Each such tab becomes one table.
export function namesMap(grids: Grid[], currency: string): AiMapT | null { return mapByNames(grids, currency, false) }
function mapByNames(grids: Grid[], currency: string, mark: boolean): AiMapT | null {
  const letter = (i: number) => { let s = '', k = i + 1; while (k > 0) { const m = (k - 1) % 26; s = String.fromCharCode(65 + m) + s; k = Math.floor((k - 1) / 26) } return s }
  const blocks: AiMapT['blocks'] = []
  for (const g of grids) {
    const a1 = g.rows[0]?.[0]
    if (mark && (typeof a1 !== 'string' || !a1.trim().startsWith(TEMPLATE_MARK))) continue
    const hi = g.rows.findIndex((r) => r.slice(1).filter((c) => monthOf(c) !== null).length >= (mark ? 3 : 2))
    if (hi < 0) continue
    // The label column: A, or the first column holding text under the heading row.
    const lc = mark ? 0 : Math.max(0, [0, 1, 2].find((j) => g.rows.slice(hi + 1, hi + 30).filter((r) => typeof r[j] === 'string' && !monthOf(r[j] ?? null)).length >= 3) ?? 0)
    const periods = g.rows[hi]!.map((c, j) => ({ j, m: j ? monthOf(c) : null })).filter((x) => x.m).map((x) => {
      const d = new Date(x.m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0)
      return { col: letter(x.j), period_type: 'month' as const, period_end: d.toISOString().slice(0, 10), projected: false }
    })
    const rows: { i: number; label: string; values: Record<string, number> }[] = []
    for (let i = hi + 1; i < g.rows.length; i++) {
      const l = g.rows[i]?.[lc]; if (typeof l !== 'string' || !l.trim()) continue
      const values: Record<string, number> = {}
      periods.forEach((p) => { const v = g.rows[i]?.[letterIdx(p.col)]; if (typeof v === 'number') values[p.period_end.slice(0, 7)] = v })
      rows.push({ i, label: l.trim(), values: Object.keys(values).length ? values : { _: 0 } })
    }
    const sug = suggestMapping(rows.map((r) => ({ label: r.label, values: r.values })), 'financials')
    const out: AiMapT['blocks'][number]['rows'] = []
    rows.forEach((r, k) => {
      const kpi = /^kpi\s*:\s*(.+)$/i.exec(r.label)
      if (kpi) { if (kpi[1]!.trim()) out.push({ row: r.i + 1, label: r.label.slice(0, 120), to: 'kpi', kpi: kpi[1]!.trim().slice(0, 60), pct: false }); return }
      const to = sug[k]?.to
      if (to && to !== 'kpi') out.push({ row: r.i + 1, label: r.label.slice(0, 120), to, kpi: '', pct: false })
    })
    if (periods.length && out.length) blocks.push({ sheet: g.name, title: mark ? 'Finvry template' : g.name, label_col: letter(lc), scale: 1, periods, rows: out.slice(0, 200), use: true })
  }
  if (!blocks.length) return null
  return { company: { name: '', description: '', website: '' }, reporting_currency: currency, fiscal_year_end: '', tabs: grids.map((g) => ({ sheet: g.name, what: blocks.some((b) => b.sheet === g.name) ? 'Finvry financials template' : 'Not part of the template', used: blocks.some((b) => b.sheet === g.name) })),
    blocks, facts: [], suggestions: [], notes: mark ? 'Finvry template: read exactly by its line names, with no AI.' : 'Read by line names, with no AI.' }
}
const letterIdx = (s: string) => s.toUpperCase().split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1
