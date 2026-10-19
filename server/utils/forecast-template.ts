// The Finvry forecast template, in the same shape as the financials template: the mark in A1, the months on row 4, the
// forecast's lines down column A by name (formulas work out the totals and the cash), and nothing else to learn. Finvry
// reads it by fixed rules, with no AI: each row by its name, the months from the heading row.
import type { Grid } from './sheet-links'
import type { ReadSheet } from './forecast-import'

export const FORECAST_MARK = 'Finvry forecast template'
type Row = { head: string } | { label: string; key?: string; f?: (c: string, at: Record<string, number>, prev: string | null) => string; note?: string }
// key: where the row goes in a forecast (cash_balance is the check against the closing cash; opening is the cash at the start).
export const FORECAST_ROWS: Row[] = [
  { head: 'Profit and loss' },
  { label: 'Revenue', key: 'revenue' },
  { label: 'Cost of revenue', key: 'cogs', note: 'Direct costs: hosting, carrier and network costs, payment fees.' },
  { label: 'Gross profit', f: (c, at) => `${c}${at['Revenue']}-${c}${at['Cost of revenue']}` },
  { label: 'Payroll', key: 'payroll', note: 'Salaries, benefits, pension and contractors on payroll.' },
  { label: 'Sales & marketing', key: 'marketing' },
  { label: 'Product & engineering (non-payroll)', key: 'rnd', note: 'Software, cloud tools, technology spend not in cost of revenue.' },
  { label: 'General & admin', key: 'ga', note: 'Rent, utilities, bank charges, professional fees, insurance.' },
  { label: 'Other operating costs', key: 'other' },
  { label: 'Total operating costs', f: (c, at) => `SUM(${c}${at['Payroll']}:${c}${at['Other operating costs']})` },
  { label: 'EBITDA', f: (c, at) => `${c}${at['Gross profit']}-${c}${at['Total operating costs']}` },
  { label: 'Tax', key: 'tax' },
  { label: 'Net income', f: (c, at) => `${c}${at['EBITDA']}-${c}${at['Tax']}` },
  { head: 'Cash' },
  { label: 'Opening cash', key: 'opening', note: 'Cash in the bank at the start of the first month. Fill the first month only.' },
  { label: 'Funding raised', key: 'funding', note: 'Equity or SAFEs received, in the month the money arrives.' },
  { label: 'One-off items (capex, loans…)', key: 'items', note: 'Keep the sign: + money in (a loan received, an asset sold), − money out (capex, a loan repaid).' },
  { label: 'Net cash flow', f: (c, at) => `${c}${at['Net income']}+${c}${at['Funding raised']}+${c}${at['One-off items (capex, loans…)']}` },
  { label: 'Closing cash', key: 'cash_balance', f: (c, at, p) => `${c}${at['Opening cash']}+${p ? p + at['Closing cash'] + '+' : ''}${c}${at['Net cash flow']}` },
  { head: 'Drivers' },
  { label: 'Customers', key: 'customers', note: 'Paying customers at the end of the month.' },
  { label: 'Headcount', key: 'headcount', note: 'People on payroll at the end of the month.' }
]
const COSTS = new Set(['cogs', 'payroll', 'marketing', 'rnd', 'ga', 'other', 'tax'])

export async function forecastTemplateWorkbook(o: { currency?: string; start?: string; months?: number; values?: Record<string, Record<string, number>>; opening_cash?: number | null; title?: string; note?: string; guide?: string[] } = {}): Promise<Buffer> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); wb.creator = 'Finvry'
  const F = { name: 'Instrument Sans', size: 10.5 }, NAVY = 'FF0C1A2E', MUT = 'FF6E737B', SOFT = 'FFF4F6FA'
  const now = new Date(), start = o.start ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7)
  const n = o.months ?? 24, months = Array.from({ length: n }, (_, k) => { const d = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1 + k, 1)); return d })
  const ws = wb.addWorksheet('Forecast', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] })
  ws.getColumn(1).width = 40; months.forEach((_, k) => { ws.getColumn(k + 2).width = 13 })
  ws.getCell('A1').value = FORECAST_MARK + ' · v1'; ws.getCell('A1').font = { ...F, bold: true, color: { argb: NAVY } }
  ws.getCell('A2').value = o.note ?? ('Amounts in ' + (o.currency ?? 'USD') + ', one column per month. Costs as positive numbers. Fill the white cells; grey rows work themselves out. Keep the line names as they are.')
  ws.getCell('A2').font = { ...F, color: { argb: MUT } }
  const hr = ws.getRow(4); hr.getCell(1).value = 'Line'
  months.forEach((d, k) => { const c = hr.getCell(k + 2); c.value = d; c.numFmt = 'mmm yyyy' })
  hr.font = { ...F, bold: true, color: { argb: 'FFFFFFFF' } }; hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } } })
  const at: Record<string, number> = {}; let r = 5
  for (const x of FORECAST_ROWS) { if ('label' in x) at[x.label] = r; r++ }
  r = 5
  for (const x of FORECAST_ROWS) {
    const row = ws.getRow(r)
    if ('head' in x) { row.getCell(1).value = x.head; row.getCell(1).font = { ...F, bold: true, color: { argb: NAVY } }; row.height = 22 }
    else {
      row.getCell(1).value = x.label; row.getCell(1).font = { ...F, bold: !!x.f }
      if (x.note) row.getCell(1).note = x.note
      months.forEach((d, k) => {
        const col = ws.getColumn(k + 2).letter, prev = k ? ws.getColumn(k + 1).letter : null, c = row.getCell(k + 2), m = d.toISOString().slice(0, 7)
        c.numFmt = x.key === 'customers' || x.key === 'headcount' ? '#,##0' : '#,##0;(#,##0);"-"'; c.font = F
        if (x.f) { c.value = { formula: x.f(col, at, prev) } as never; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }; c.font = { ...F, bold: true } }
        else if (x.key === 'opening') { if (k === 0 && o.opening_cash != null) c.value = o.opening_cash; if (k > 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } } }
        else if (x.key) { const v = o.values?.[x.key]?.[m]; if (v !== undefined && v !== null) c.value = v }
      })
    }
    r++
  }
  const g = wb.addWorksheet('How to use', { views: [{ showGridLines: false }] }); g.getColumn(1).width = 4; g.getColumn(2).width = 100
  const line = (t: string, s: { bold?: boolean; size?: number; color?: string } = {}) => { const q = g.addRow(['', t]); q.getCell(2).font = { ...F, bold: s.bold, size: s.size ?? 10.5, color: s.color ? { argb: s.color } : undefined }; q.getCell(2).alignment = { wrapText: true, vertical: 'top' } }
  g.addRow([]); line(o.title ?? 'Finvry forecast template', { bold: true, size: 16, color: NAVY })
  line('Finvry reads this layout exactly, with no AI, so your forecast comes in the same way every time.', { color: MUT }); g.addRow([])
  for (const [h, t] of [
    ['1. Start next month', 'The first column is the first forecast month; months you have already closed belong in Financials. Add columns to the right for a longer forecast (up to 60 months).'],
    ['2. Fill the white rows', 'Revenue and each cost line for every month, costs as positive numbers. Grey rows (gross profit, totals, EBITDA, net income, net cash flow, closing cash) work themselves out.'],
    ['3. Cash', 'Put the cash in the bank at the start in the first month of "Opening cash". Funding goes in the month the money arrives; one-off items keep their sign (+ money in, − money out).'],
    ['4. Keep the line names', 'Finvry knows each line by its name. Several of your own lines (for example Consultants and Rent) can be added into one line here (General & admin) before you upload.'],
    ['5. Upload or link it', 'Forecast → Import from a file, or Link a sheet to keep a Google Sheet in step. After the last month you give, the forecast continues with assumptions you can change in Finvry.'],
    ...(o.guide ?? []).map((t, i) => [i ? '' : 'About these figures', t])]) { if (h) line(h, { bold: true }); line(t); g.addRow([]) }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const nm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const BY_LABEL = new Map(FORECAST_ROWS.filter((x): x is Extract<Row, { label: string }> => 'label' in x).map((x) => [nm(x.label), x.key ?? 'ignore']))
// Other names for the template's rows when a forecast is laid out the same way (months across, names down a column).
const ALSO: Record<string, string[]> = { opening: ['cash at start', 'starting cash', 'opening balance', 'cash at the start', 'opening cash balance'], cash_balance: ['closing cash', 'cash balance', 'cash at end', 'ending cash', 'closing balance', 'cash at the end'],
  items: ['one off items', 'one off items capex loans', 'capex', 'capital expenditure', 'loans'], ignore: ['gross profit', 'total operating costs', 'total operating expenses', 'total opex', 'total expenses', 'ebitda', 'ebit', 'net income', 'net profit', 'net loss', 'net cash flow', 'operating income', 'gross margin'] }

// A forecast sheet read by fixed rules: the Finvry forecast template, or any tab with months across one heading row
// and line names down a column. Returns the same shape the AI reader returns, so the founder checks it the same way.
export function forecastFromGrids(grids: Grid[], currency = 'USD'): ReadSheet | null {
  const lays = layouts(grids)
  if (!lays.length) return null
  const isT = (sheet: string) => { const g = grids.find((x) => x.name === sheet); const a = g?.rows[0]?.[0]; return typeof a === 'string' && a.trim().startsWith(FORECAST_MARK) }
  const keyOf = (label: string, taken: Set<string>): string | null => {
    const n = nm(label.replace(/\s*\(\d+\)$/, ''))
    if (BY_LABEL.has(n)) return BY_LABEL.get(n)!
    for (const [k, ws] of Object.entries(ALSO)) if (ws.includes(n)) return k
    const s = suggestMapping([{ label, values: {} }], 'forecast')[0]?.to
    return s && !taken.has(s) ? s : null
  }
  const scored = lays.map((l) => { const taken = new Set<string>(); let hit = 0; for (const r of l.rows) { const k = keyOf(r.label, taken); if (k && k !== 'ignore') { hit++; taken.add(k) } } return { l, hit, t: isT(l.sheet) } })
  const pick = scored.find((x) => x.t) ?? scored.sort((a, b) => b.hit - a.hit)[0]!
  if (!pick.t && pick.hit < 2) return null
  const taken = new Set<string>(), lines: ReadSheet['lines'] = [], notes: string[] = []
  let opening: number | null = null, inCosts = false
  const COSTKEYS = new Set(['payroll', 'marketing', 'rnd', 'ga', 'other'])
  for (const r of pick.l.rows) {
    let k = keyOf(r.label, taken)
    // A row of the company's own among the operating costs (Consultants, Rent…) becomes its own cost line.
    if (k && COSTKEYS.has(k)) inCosts = true
    else if (k === 'ignore' || (k && !COSTKEYS.has(k))) inCosts = false
    else if (!k && inCosts && Object.values(r.values).some((v) => v !== 0)) k = 'new'
    const vals = Object.entries(r.values).sort(([a], [b]) => (a < b ? -1 : 1))
    if (k === 'opening') { opening = vals[0]?.[1] ?? null; continue }
    const to = (k ?? 'ignore') as ReadSheet['lines'][number]['maps_to']
    if (to !== 'ignore' && to !== 'cash_balance' && to !== 'items' && to !== 'funding' && to !== 'customers' && to !== 'headcount') taken.add(to)
    lines.push({ label: r.label, maps_to: to, values: vals.map(([month, v]) => ({ month, value: COSTS.has(to) || to === 'new' ? Math.abs(v) : v })) })
  }
  const used = lines.filter((l) => l.maps_to !== 'ignore' && l.maps_to !== 'cash_balance' && l.values.length)
  if (!used.length) return null
  const start = used.flatMap((l) => l.values.map((v) => v.month)).sort()[0]!
  const own = lines.filter((l) => l.maps_to === 'new').map((l) => l.label)
  if (own.length) notes.push('Your own cost lines, kept as their own lines in the forecast: ' + own.join(', ') + '. Change any of them to an existing line if you prefer.')
  notes.push((pick.t ? 'Read from the Finvry forecast template' : 'Read from "' + pick.l.sheet + '" by line names') + ', with no AI.' + (pick.t ? '' : ' Lines with other names are left out: check each line below.'))
  if (opening === null) notes.push('No opening cash in the file: the cash at the start is taken from your figures; change it on the forecast if needed.')
  return { currency, start, opening_cash: opening, lines, notes }
}
