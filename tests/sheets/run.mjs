// Regression tests for reading financial sheets: subtotals, repairs and blank months. Run with `npm run test:sheets`.
// The fixtures are real layouts with made-up figures: a messaging company's investor metrics tab (current and
// non-current subtotals, equity parts, template columns for future months) and a QuickBooks-style balance sheet (bank
// accounts, fixed and other assets, long-term liabilities). Each stored map is checked the way Finvry checks a map
// before saving it. Every change to the AI prompt (sheet-map-v*) must keep these passing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createJiti } from 'jiti'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const jiti = createJiti(import.meta.url, { alias: { '~': root }, interopDefault: true })
// Nitro auto-imports these in the app; here they are put in place by hand.
const apiError = (code, message) => Object.assign(new Error(message), { data: { error: { code, message } } })
Object.assign(globalThis, { apiError })
const F = await jiti.import(join(root, 'server/utils/financials.ts'))
Object.assign(globalThis, { LINES: F.LINES, LINE_KEYS: F.LINE_KEYS, balanceError: F.balanceError, INVEST_RULES: F.INVEST_RULES })
const A = await jiti.import(join(root, 'server/utils/accounts.ts'))
Object.assign(globalThis, { isCat: A.isCat, catOf: A.catOf, addFigure: A.addFigure, foldCategories: A.foldCategories, mergeStatement: A.mergeStatement })
const S = await jiti.import(join(root, 'server/utils/sheet-links.ts'))
Object.assign(globalThis, { suggestMapping: S.suggestMapping, monthOf: S.monthOf })
const AI = await jiti.import(join(root, 'server/utils/sheet-ai.ts'))
const T = await jiti.import(join(root, 'server/utils/fin-template.ts'))

const fx = (n) => readFileSync(join(root, 'tests/sheets/fixtures', n))
let failed = 0
const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed++ }
const TODAY = '2026-10-18'
const months = (from, n, col0) => Array.from({ length: n }, (_, k) => { const d = new Date(Date.UTC(2026, from - 1 + k + 1, 0)); return { col: String.fromCharCode(col0 + k), period_type: 'month', period_end: d.toISOString().slice(0, 10), projected: false } })
const mapOf = (sheet, periods, rows) => ({ company: { name: '', description: '', website: '' }, reporting_currency: 'USD', fiscal_year_end: '', tabs: [{ sheet, what: '', used: true }], facts: [], suggestions: [], notes: '',
  blocks: [{ sheet, title: sheet, label_col: 'A', scale: 1, periods, use: true, rows: rows.map(([row, label, to]) => ({ row, label, to, kpi: to === 'kpi' ? label : '', pct: false })) }] })
const bsChecks = (grids, map) => AI.previewOf(AI.readWithMap(grids, map, TODAY)).checks.filter((c) => ['Total assets', 'Total liabilities', 'Balance sheet'].includes(c.what))

// 1. Messaging company: the map the AI produced in the incident (subtotals pointed at standard lines).
{
  const grids = await S.readGrids(fx('messaging-co-2026.xlsx'), 'xlsx')
  const sheet = grids[0].name, periods = months(1, 12, 66) // B..M = Jan..Dec 2026
  const bad = mapOf(sheet, periods, [[7, 'Revenue', 'revenue'], [11, 'Cost of Sales', 'cogs'], [23, 'Total Expenses', 'opex_total'], [32, 'Net Income', 'net_income'],
    [40, 'Cash & Marketable Securities', 'cash'], [41, 'Receivables & Prepayments', 'receivables'], [45, 'Total Current Assets', 'total_assets'], [51, 'Total Non-Current Assets', 'other_assets'],
    [56, 'Accounts Payable', 'payables'], [61, 'Total Current Liabilities', 'other_liabilities'], [63, 'TOTAL LIABILITIES', 'total_liabilities'], [70, 'Total Equity', 'equity']])
  check('incident map fails before the guard', bsChecks(grids, bad).length > 0, bsChecks(grids, bad).length + ' failures')
  const subs = AI.subtotalRows(grids[0], periods.slice(0, 6).map((p) => p.col.charCodeAt(0) - 65))
  check('subtotal rows found (Total Current Assets, Total Non-Current Assets, Total Current Liabilities)', [44, 50, 60].every((i) => subs.has(i)), [...subs].map((i) => i + 1).join(', '))
  const g = AI.guardMap(grids, bad)
  check('guard demotes the 3 subtotal rows', ['Total Current Assets', 'Total Non-Current Assets', 'Total Current Liabilities'].every((l) => g.changed.some((c) => c.startsWith(l))), g.changed.join('; '))
  check('guard adds TOTAL ASSETS as total assets', g.map.blocks[0].rows.some((r) => r.to === 'total_assets' && r.row === 52))
  const rep = await AI.repairMap(grids, bad)
  check('repaired map passes every balance sheet check', rep.failures === 0, 'kept: ' + rep.how)
  const r = AI.readWithMap(grids, rep.map, TODAY)
  check('Jul–Dec 2026 (template zeros) not brought in', !r.periods.some((p) => p.period_end >= '2026-07-01'), r.periods.map((p) => p.period_end.slice(0, 7)).join(' '))
  const all = AI.previewOf(r).checks
  check('no add-up failures at all after repair', all.filter((c) => c.severity === 'error').length === 0, all.map((c) => c.period_end.slice(0, 7) + ' ' + c.what).join(', '))
  // The row-by-row mapper alone on the same tab.
  const rows = AI.rowsMapFor(grids, mapOf(sheet, periods, [[7, 'Revenue', 'revenue']]))
  check('row mapper alone passes the balance sheet checks', bsChecks(grids, rows).length === 0)
  // A sync that still meets a bad balance sheet holds it back.
  const p = { period_end: '2026-06-30', period_type: 'month', lines: { cash: 100, receivables: 50, other_assets: 10, total_assets: 999, revenue: 40 }, detail: { 'other_assets|Loans': 10 } }
  const held = AI.holdBadBalanceSheet(p)
  check('bad balance sheet held back, P&L kept', !!held && p.lines.revenue === 40 && !('cash' in p.lines) && !Object.keys(p.detail).length, held ?? '')
  check('blank month skipped', AI.blankPeriod({ lines: { total_assets: 0, total_liabilities: 0 }, kpis: {}, detail: {} }) === 'all')
  const pb = { lines: { revenue: 10, total_assets: 0, cash: 0 }, kpis: {}, detail: {} }
  check('all-zero balance sheet dropped, P&L kept', AI.blankPeriod(pb) === 'bs' && pb.lines.revenue === 10 && !('cash' in pb.lines))
}

// 2. QuickBooks-style balance sheet with nested subtotals.
{
  const grids = await S.readGrids(fx('qb-style-balance-sheet.xlsx'), 'xlsx')
  const sheet = grids[0].name, periods = months(1, 6, 66) // B..G = Jan..Jun 2026
  const find = (label) => grids[0].rows.findIndex((r) => r[0] === label) + 1
  const bad = mapOf(sheet, periods, [[find('Total Bank Accounts'), 'Total Bank Accounts', 'cash'], [find('Accounts Receivable'), 'Accounts Receivable', 'receivables'],
    [find('Total Current Assets'), 'Total Current Assets', 'total_assets'], [find('Total Fixed Assets'), 'Total Fixed Assets', 'other_assets'], [find('Total Other Assets'), 'Total Other Assets', 'cat:other_assets:Other assets'],
    [find('Accounts Payable'), 'Accounts Payable', 'payables'], [find('Total Current Liabilities'), 'Total Current Liabilities', 'total_liabilities'], [find('Bank loan'), 'Bank loan', 'debt'], [find('Total Equity'), 'Total Equity', 'equity']])
  const g = AI.guardMap(grids, bad)
  check('QB: cash kept on Total Bank Accounts', g.map.blocks[0].rows.some((r) => r.to === 'cash'))
  check('QB: current and fixed subtotals demoted', ['Total Current Assets', 'Total Fixed Assets', 'Total Other Assets', 'Total Current Liabilities'].every((l) => g.changed.some((c) => c.startsWith(l))), g.changed.join('; '))
  const rep = await AI.repairMap(grids, bad)
  check('QB: repaired map passes every balance sheet check', rep.failures === 0, 'kept: ' + rep.how)
  const rows = AI.rowsMapFor(grids, mapOf(sheet, periods, []))
  check('QB: row mapper alone passes the balance sheet checks', bsChecks(grids, rows).length === 0, bsChecks(grids, rows).map((c) => c.what + ' ' + c.detail).slice(0, 2).join(' | '))
}

// 3. A P&L section total pointed at a cost line.
{
  const grid = { name: 'P&L', rows: [['', 'Jan', 'Feb', 'Mar'], ['Payroll', 100, 110, 120], ['Rent', 20, 20, 20], ['Software', 5, 6, 7], ['Total operating expenses', 125, 136, 147], ['Net income', -25, -30, -35]] }
  const subs = AI.subtotalRows(grid, [1, 2, 3])
  check('P&L: section total found by arithmetic', subs.has(4) && !subs.has(5))
  const m = mapOf('P&L', months(1, 3, 66), [[2, 'Payroll', 'opex_payroll'], [5, 'Total operating expenses', 'opex_other']])
  check('P&L: total not used as a cost line', AI.guardMap([grid], m).map.blocks[0].rows.find((r) => r.row === 5).to === 'kpi')
  const grand = { name: 'G', rows: [['', 'Jan', 'Feb'], ['A', 1, 2], ['B', 3, 4], ['Subtotal', 4, 6], ['C', 10, 10], ['D', 5, 5], ['Subtotal 2', 15, 15], ['Grand total', 19, 21]] }
  const s2 = AI.subtotalRows(grand, [1, 2])
  check('a grand total of two subtotals is not mistaken for a part', s2.has(3) && s2.has(6))
}

// 3b. The production read (Oct 2026): "Other Current Assets" mapped to other assets with the other asset rows as
// categories beside it. They are siblings, so they are added; no month is held back.
{
  const grids = await S.readGrids(fx('messaging-co-2026.xlsx'), 'xlsx')
  const sheet = grids[0].name, periods = months(1, 12, 66)
  const m = mapOf(sheet, periods, [[7, 'Revenue', 'revenue'], [40, 'Cash & Marketable Securities', 'cash'], [41, 'Receivables & Prepayments', 'receivables'], [42, 'Prepaid Carrier & Platform Costs', 'cat:other_assets:Prepaid Carrier & Platform Costs'],
    [43, 'Loans Receivable', 'cat:other_assets:Loans Receivable'], [44, 'Other Current Assets', 'other_assets'], [47, 'Property, Plant & Equipment', 'cat:other_assets:Property, Plant & Equipment'], [48, 'Intangible Assets & Certifications', 'cat:other_assets:Intangible Assets & Certifications'],
    [49, 'Notes Receivable – Startup Lending Program', 'cat:other_assets:Notes Receivable'], [50, 'Strategic Investments', 'long_term_investments'], [52, 'TOTAL ASSETS', 'total_assets'], [56, 'Accounts Payable', 'payables'],
    [57, 'Accrued Expenses & Payroll', 'cat:other_liabilities:Accrued'], [58, 'Taxes Payable', 'cat:other_liabilities:Taxes Payable'], [59, 'Customer Prepayments – Unused Credits (Deferred Revenue)', 'cat:other_liabilities:Customer Prepayments'], [60, 'Other Current Liabilities', 'other_liabilities'],
    [63, 'TOTAL LIABILITIES', 'total_liabilities'], [70, 'Total Equity', 'equity']])
  const fails = bsChecks(grids, AI.guardMap(grids, m).map)
  check('line beside its categories is added, not taken as their total', fails.length === 0, fails.slice(0, 2).map((c) => c.period_end.slice(0, 7) + ' ' + c.detail).join(' | '))
  const lines = { total_assets: 100, cash: 50, other_assets: 10 }, d = { 'other_assets|A': 20, 'other_assets|B': 20 }
  A.foldCategories(lines, d)
  check('a sibling line is added to its categories when the total says so', lines.other_assets === 50)
  const l2 = { total_assets: 100, cash: 60, other_assets: 40 }, d2 = { 'other_assets|A': 25, 'other_assets|B': 15 }
  A.foldCategories(l2, d2)
  check('a line that is the total of its categories is kept', l2.other_assets === 40)
}

{
  const sk = AI.summariseSkipped(['Jan 2026: balance sheet held back (x). A subtotal may be mapped as a line; read the sheet again with AI or choose the rows.', 'Feb 2026: balance sheet held back (x). A subtotal…', 'Mar 2026: balance sheet held back (x). A subtotal…'])
  check('held-back months summarised in one line', sk.length === 1 && /3 months \(Jan 2026 to Mar 2026\)/.test(sk[0]), sk[0])
}

// 4. A tab filed under the wrong year: each column's date comes from its own heading.
{
  const grids = await S.readGrids(fx('messaging-co-2026.xlsx'), 'xlsx')
  const wrong = months(1, 12, 66).map((p) => ({ ...p, period_end: String(Number(p.period_end.slice(0, 4)) - 1) + p.period_end.slice(4) })) // 2025 instead of 2026
  const m = mapOf(grids[0].name, wrong, [[7, 'Revenue', 'revenue'], [40, 'Cash & Marketable Securities', 'cash']])
  const g = AI.guardMap(grids, m)
  check('wrong year corrected from the column headings', g.map.blocks[0].periods.every((p) => p.period_end.startsWith('2026')), g.map.blocks[0].periods.slice(0, 2).map((p) => p.period_end).join(' '))
}

// 5. Analysis with a missing year and an old cash balance: no year-on-year against the wrong year, no runway.
{
  const V = await jiti.import(join(root, 'shared/fin-view.ts'))
  Object.assign(globalThis, { burnReview: V.burnReview, checkRows: V.checkRows, deriveLines: V.deriveLines })
  const FA = await jiti.import(join(root, 'server/utils/fin-analysis.ts'))
  const mk = (y, m, cash) => { const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); const lines = { revenue: 100000 + m * 1000, cogs: 70000, opex_total: 60000, net_income: -30000, ...(cash ? { cash } : {}) }; return { period_end: end, period_type: 'month', currency: 'USD', lines, kpis: {}, derived: V.deriveLines(lines, 1) } }
  const rows = [...Array.from({ length: 12 }, (_, k) => mk(2024, k + 1, k < 4 ? 3000000 : null)), ...Array.from({ length: 6 }, (_, k) => mk(2026, k + 1, null))]
  const f = FA.factsOf(rows, 'cpaas').facts
  check('no year-on-year against 2024 when 2025 is missing', f.revenue_growth_yoy_pct === null, String(f.revenue_growth_yoy_pct))
  check('no runway from a cash balance 26 months old', f.runway_months === null && V.burnReview(rows).runway === null, String(f.runway_months))
  const cs = V.checkRows(rows)
  check('missing months and old cash flagged', cs.some((c) => c.what === 'Missing months' && /Jan 2025 to Dec 2025/.test(c.detail)) && cs.some((c) => c.what === 'Cash missing'), cs.filter((c) => c.severity === 'warn').map((c) => c.what).join(', '))
}

// 6. The Finvry template, filled in (with the founder's own cost and asset lines added), read with no AI.
{
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); await wb.xlsx.load(await T.templateWorkbook('USD'))
  const ws = wb.getWorksheet('Financials')
  const rowOf = (label) => { let n = 0; ws.eachRow((r, i) => { if (r.getCell(1).value === label) n = i }); return n }
  ws.spliceRows(rowOf('Other operating costs'), 0, ['Consultants'])   // the founder's own cost line
  ws.spliceRows(rowOf('Long-term investments'), 0, ['Loans receivable']) // and an asset line
  const set = (label, k, v) => { ws.getRow(rowOf(label)).getCell(2 + k).value = v }
  const N = 12 + new Date().getUTCMonth() // Jan last year .. last month; the rest left empty
  for (let k = 0; k < N; k++) {
    const rev = 400000 + k * 1000, cogs = 320000, pay = 58000, mkt = 9000, cons = 17000, oth = 23000, tot = pay + mkt + cons + oth
    const vals = { 'Revenue': rev, 'Cost of revenue': cogs, 'Gross profit': rev - cogs, 'Payroll': pay, 'Sales and marketing': mkt, 'Consultants': cons, 'Other operating costs': oth, 'Total operating costs': tot, 'EBITDA': rev - cogs - tot, 'Depreciation and amortisation': 1000, 'Other income': 3000, 'Net income': rev - cogs - tot - 1000 + 3000,
      'Cash': 1000000 - k * 20000, 'Receivables': 270000, 'Other assets': 120000, 'Loans receivable': 214000, 'Long-term investments': 490000, 'Payables': 170000, 'Other liabilities': 230000, 'KPI: Paying customers': 42000 + k, 'KPI: Headcount': 66 }
    const ta = vals.Cash + 270000 + 120000 + 214000 + 490000, tl = 400000
    Object.assign(vals, { 'Total assets': ta, 'Total liabilities': tl, 'Total equity': ta - tl })
    for (const [l, v] of Object.entries(vals)) set(l, k, v)
  }
  const grids = await S.readGrids(Buffer.from(await wb.xlsx.writeBuffer()), 'xlsx')
  const m = T.templateMap(grids, 'USD')
  check('template recognised and mapped with no AI', !!m && m.blocks.length === 1, m ? m.blocks[0].rows.length + ' rows' : 'not recognised')
  const rows = m.blocks[0].rows
  check('own lines kept as categories', rows.some((r) => r.label === 'Consultants' && r.to === 'cat:opex_other:Consultants') && rows.some((r) => r.label === 'Loans receivable' && r.to === 'cat:other_assets:Loans receivable'), rows.filter((r) => r.to.startsWith('cat:')).map((r) => r.to).join(', '))
  check('KPI rows read as metrics', rows.some((r) => r.to === 'kpi' && r.kpi === 'Paying customers'))
  const r = AI.readWithMap(grids, m) // today, since the template is dated from this year
  const all = AI.previewOf(r).checks
  check('template: every filled month in, every check passes', r.periods.length === N && !all.length, r.periods.length + ' months; ' + all.map((c) => c.period_end.slice(0, 7) + ' ' + c.what).slice(0, 3).join(', '))
  const jun = r.periods[r.periods.length - 1]
  check('template: categories added into their lines', !!jun && jun.lines.opex_other === 40000 && jun.lines.other_assets === 334000, jun ? 'opex_other ' + jun.lines.opex_other + ', other_assets ' + jun.lines.other_assets : 'no months')
}

// 7. Any sheet with months across and line names down a column, read by line names with no AI (Add figures).
{
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); const ws = wb.addWorksheet('P&L 2026')
  ws.addRow(['Acme Ltd management accounts']); ws.addRow([])
  ws.addRow(['', new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 1, 1)), new Date(Date.UTC(2026, 2, 1))])
  for (const [l, a, b, c] of [['Revenue', 100, 110, 120], ['Cost of revenue', 40, 44, 48], ['Gross profit', 60, 66, 72], ['Payroll', 20, 20, 20], ['Net income', 40, 46, 52], ['Cash', 900, 940, 990]]) ws.addRow([l, a, b, c])
  const grids = await S.readGrids(Buffer.from(await wb.xlsx.writeBuffer()), 'xlsx')
  const m = T.namesMap(grids, 'USD')
  const r = m ? AI.readWithMap(grids, m, TODAY) : { periods: [] }
  const mar = r.periods.find((p) => p.period_end === '2026-03-31')
  check('plain sheet read by line names (no AI)', !!mar && mar.lines.revenue === 120 && mar.lines.cash === 990 && mar.lines.opex_payroll === 20, mar ? JSON.stringify(mar.lines) : 'no March')
}

// 8. The Finvry customer revenue template: one row per customer, months across, currencies with the file's rates.
{
  Object.assign(globalThis, { numOf: S.numOf, fxRates: async () => ({ rates: new Map() }) })
  const CT = await jiti.import(join(root, 'server/utils/customer-template.ts'))
  const CI = await jiti.import(join(root, 'server/utils/customer-import.ts'))
  const ms = ['2026-01', '2026-02', '2026-03']
  const buf = await CT.customerTemplateWorkbook({ months: ms, customers: [
    { name: 'Acme Bank', segment: 'Enterprise', sector: 'Banking', country: 'Nigeria', plan: 'Messaging', started_on: '2025-06-01', acquisition_cost: 500, currency: 'USD', rev: { '2026-01': 1000, '2026-02': 1100, '2026-03': 1200 } },
    { name: 'Bright Shop', segment: 'SMB', sector: 'Retail', currency: 'NGN', rev: { '2026-02': 150000, '2026-03': 300000 } }],
    rates: { NGN: { '2026-02': 1500, '2026-03': 1500 } } })
  const grids = await S.readGrids(buf, 'xlsx', { tabs: 40, rows: 60000, cols: 240 })
  const p = await CI.parseCustomers(grids, 'test', 'USD')
  const acme = p.customers.find((c) => c.name === 'Acme Bank'), shop = p.customers.find((c) => c.name === 'Bright Shop')
  check('customer template: read with no AI, Customers tab only', p.sheet === 'Customers' && !p.ai_mapped && p.customers.length === 2, p.sheet + ', ' + p.customers.length + ' customers')
  check('customer template: months and attributes', !!acme && acme.rev['2026-03'] === 1200 && acme.sector === 'Banking' && acme.started_on === '2025-06-01' && acme.acquisition_cost === 500, JSON.stringify(acme))
  check('customer template: NGN converted at the file\'s rates', !!shop && shop.rev['2026-03'] === 200 && shop.rev['2026-02'] === 100, JSON.stringify(shop?.rev))
  // The same file with its parts in the order that broke the streamed reader (a sheet after the shared strings, the
  // workbook part last): read whole instead.
  const { default: JSZip } = await import('jszip')
  const z = await JSZip.loadAsync(buf), names = Object.keys(z.files).filter((n) => !z.files[n].dir)
  const order = names.filter((n) => n !== 'xl/worksheets/sheet3.xml' && n !== 'xl/workbook.xml'); order.splice(order.indexOf('xl/sharedStrings.xml') + 1, 0, 'xl/worksheets/sheet3.xml'); order.push('xl/workbook.xml')
  const z2 = new JSZip(); for (const n of order) z2.file(n, await z.file(n).async('uint8array'))
  const odd = await S.readGrids(await z2.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), 'xlsx', { tabs: 40, rows: 60000, cols: 240 })
  check('workbook with parts in an unusual order still opens', odd.length === 3 && odd[0].name === 'Customers', odd.map((g) => g.name).join(', '))
  // One row per customer per month still works.
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); const ws = wb.addWorksheet('Revenue')
  ws.addRow(['Customer', 'Month', 'Revenue', 'Sector']); ws.addRow(['Acme Bank', '2026-01', 1000, 'Banking']); ws.addRow(['Acme Bank', '2026-02', 1100, 'Banking'])
  const lp = await CI.parseCustomers(await S.readGrids(Buffer.from(await wb.xlsx.writeBuffer()), 'xlsx'), 'test', 'USD')
  check('long customer layout read', lp.customers.length === 1 && lp.customers[0].rev['2026-02'] === 1100)
}

// 9. The Finvry forecast template, read with no AI (Import from a file), and linked row by row.
{
  Object.assign(globalThis, { layouts: S.layouts })
  const FT = await jiti.import(join(root, 'server/utils/forecast-template.ts'))
  const buf = await FT.forecastTemplateWorkbook({ start: '2027-01', months: 12, opening_cash: 500000, values: { revenue: { '2027-01': 100000, '2027-02': 110000 }, cogs: { '2027-01': -40000, '2027-02': 44000 }, payroll: { '2027-01': 30000 }, items: { '2027-02': -20000 }, customers: { '2027-01': 120 } } })
  const grids = await S.readGrids(buf, 'xlsx')
  const f = FT.forecastFromGrids(grids, 'USD')
  const line = (k) => f?.lines.find((l) => l.maps_to === k)
  check('forecast template read with no AI', !!f && f.start === '2027-01' && f.opening_cash === 500000 && line('revenue')?.values.length === 2, f ? f.start + ' ' + f.opening_cash + ' ' + f.lines.map((l) => l.maps_to).join(',') : 'not read')
  check('forecast template: costs positive, one-offs keep their sign', line('cogs')?.values[0].value === 40000 && line('items')?.values[0].value === -20000 && line('customers')?.values[0].value === 120)
  const lay = S.layouts(grids)[0], sug = S.suggestMapping(lay.rows, 'forecast')
  check('forecast template rows link by name', ['revenue', 'cogs', 'payroll', 'items', 'customers'].every((k) => sug.some((m) => m.to === k)) && !sug.some((m) => /Gross profit|Net income/.test(m.label) && m.to), sug.filter((m) => m.to).map((m) => m.label + '→' + m.to).join(', '))
}

// 10. Valuation from trading peers: quartiles, gross-profit multiple, discounts and net cash.
{
  const V = await jiti.import(join(root, 'shared/valuation.ts'))
  const co = { currency: 'USD', latest: '2026-06-30', revenue_ttm: 5000000, ttm_source: '', run_rate: 4800000, arr: null, gross_profit_ttm: 1000000, gross_margin_pct: 20, ebitda_ttm: -700000, ebitda_margin_pct: -14, growth_pct: 6, growth_source: '', cash: 1000000, debt: 0, business_type: '', note: '' }
  const P = (name, ev_revenue, gross_margin_pct) => V.cleanPeer({ name, kind: 'public', ev_revenue, gross_margin_pct, growth_pct: 10 })
  const r = V.valuate(co, [P('A', 1, 40), P('B', 2, 40), P('C', 3, 40), V.cleanPeer({ name: 'D', kind: 'public', ev_revenue: 9, use: false })], { ...V.VAL_DEFAULT, private_discount: 20, market_discount: 0 })
  const evr = r.methods.find((m) => m.key === 'ev_revenue'), gp = r.methods.find((m) => m.key === 'ev_gp')
  check('valuation: unticked peers left out, quartiles of the rest', !!evr && evr.low === 1.5 && evr.mid === 2 && evr.high === 2.5 && evr.peers === 3, evr ? evr.low + ' ' + evr.mid + ' ' + evr.high : 'none')
  check('valuation: gross-profit multiple adjusts for a lower margin', !!gp && gp.mid === 5 && Math.round(gp.ev[1]) === 4000000, gp ? gp.mid + ' ' + Math.round(gp.ev[1]) : 'none')
  check('valuation: no EBITDA multiple while EBITDA is negative; discount and net cash applied', !r.methods.some((m) => m.key === 'ev_ebitda') && Math.round(evr.ev[1]) === 8000000 && Math.round(r.equity[1]) === Math.round((8000000 + 4000000) / 2 + 1000000))
}

console.log(failed ? '\n' + failed + ' check(s) failed' : '\nAll sheet checks passed')
process.exit(failed ? 1 : 0)
