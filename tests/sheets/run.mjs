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

// 5b. Burn: a loss-making company whose balance sheet says "no burn" while cash falls is not cash-flow positive.
{
  const V = await jiti.import(join(root, 'shared/fin-view.ts'))
  const mk = (m, ni, cash, liab) => ({ period_end: new Date(Date.UTC(2026, m, 0)).toISOString().slice(0, 10), period_type: 'month', currency: 'USD', kpis: {}, lines: { revenue: 10000, cogs: 3000, opex_total: 12000, net_income: ni, cash, receivables: 1000, other_liabilities: liab } })
  const loss = V.burnReview([mk(1, -5000, 100000, 0), mk(2, -5000, 80000, 100000), mk(3, -5000, 60000, 200000), mk(4, -5000, 40000, 300000)])
  check('burn: unexplained "no burn" not used when cash falls', !loss.profitable && loss.burn === 20000 && loss.runway === 2 && /Fall in cash/.test(loss.basis), loss.basis + ' ' + loss.burn + ' ' + loss.runway)
  const prof = V.burnReview([mk(1, 5000, 100000, 0), mk(2, 5000, 105000, 0), mk(3, 5000, 110000, 0), mk(4, 5000, 115000, 0)])
  check('burn: a profitable company with rising cash stays cash-flow positive', prof.profitable && prof.burn === 0, String(prof.burn))
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
  // The founder's own cost line inside the operating costs becomes its own line.
  const { default: Excel2 } = await import('exceljs'); const wb2 = new Excel2.Workbook(); await wb2.xlsx.load(buf)
  const ws2 = wb2.getWorksheet('Forecast'); let at = 0; ws2.eachRow((r, i) => { if (r.getCell(1).value === 'Other operating costs') at = i })
  ws2.spliceRows(at, 0, ['Consultants', 9000, 9000])
  const f2 = FT.forecastFromGrids(await S.readGrids(Buffer.from(await wb2.xlsx.writeBuffer()), 'xlsx'), 'USD')
  check('forecast: own cost line kept as a new line', f2?.lines.some((l) => l.label === 'Consultants' && l.maps_to === 'new' && l.values[0].value === 9000), f2?.lines.map((l) => l.label + '→' + l.maps_to).join(', '))
  // Detail lines marked "(in Payroll)", or that add up to the template line after them, are not counted twice.
  const wb3 = new (await import('exceljs')).default.Workbook(), ws3 = wb3.addWorksheet('Forecast')
  ws3.addRow(['Line', new Date(Date.UTC(2027, 0, 1)), new Date(Date.UTC(2027, 1, 1))]); ws3.addRow(['Profit and loss'])
  for (const r of [['Core (in Revenue)', 100, 110], ['New product (in Revenue)', 0, 5], ['Revenue', 100, 115], ['Cost of revenue', 40, 44], ['Staff costs (in Payroll)', 30, 30], ['Payroll', 30, 30],
    ['Ads', 5, 5], ['Events', 2, 3], ['Sales & marketing', 7, 8], ['Rent (in General & admin)', 4, 4], ['General & admin', 4, 4], ['Opening cash', 500], ['Intercompany settlement (in One-off items)', -9, -9], ['One-off items (capex, loans…)', -9, -9]]) ws3.addRow(r)
  const f3 = FT.forecastFromGrids(await S.readGrids(Buffer.from(await wb3.xlsx.writeBuffer()), 'xlsx'), 'NGN')
  const counted = (f3?.lines ?? []).filter((l) => !['ignore', 'cash_balance', 'customers', 'headcount'].includes(l.maps_to)).map((l) => l.maps_to + ':' + l.values[0].value).join(',')
  check('forecast: detail lines counted once', counted === 'revenue:100,cogs:40,payroll:30,marketing:7,ga:4,items:-9' && f3.currency === 'NGN' && f3.opening_cash === 500, counted)
  // ...and kept as the company's own lines under their totals (products under Revenue), so investors see the breakdown.
  const po = (f3?.lines ?? []).filter((l) => l.part_of).map((l) => l.part_of + ':' + l.label).join(',')
  check('forecast: detail lines kept as own lines under their totals', po === 'revenue:Core (in Revenue),revenue:New product (in Revenue),payroll:Staff costs (in Payroll),marketing:Ads,marketing:Events,ga:Rent (in General & admin),items:Intercompany settlement (in One-off items)', po)
  const FC = await jiti.import(join(root, 'shared/forecast.ts'))
  const fa = { ...FC.defaults('2027-01'), months: 4, revenue: { ...FC.defaults('2027-01').revenue, growth_pct: 10 }, fixed: { '2027-01': { revenue: 100, parts: { p_core: 100, p_new: 0 } }, '2027-02': { revenue: 115, parts: { p_core: 110, p_new: 5 } } },
    parts: [{ key: 'p_core', label: 'Core', parent: 'revenue', share_pct: 0 }, { key: 'p_new', label: 'New product', parent: 'revenue', share_pct: 0 }] }
  FC.partShares(fa); const fr = FC.run(fa), best = FC.run(fa, 'best')
  check('forecast: own lines take the given figures, then their share of the line', fa.parts[1].share_pct === 4.3 && fr.months[1].parts.p_new === 5 && fr.months[2].parts.p_core === Math.round(126.5 * 0.957 * 100) / 100 && Math.abs(best.months[1].parts.p_core - 110 * best.months[1].revenue / 115) < 0.01, JSON.stringify(fr.months.map((m) => m.parts)))
  const fb = { ...fa, parts: [{ ...fa.parts[0], share_pct: 80 }, fa.parts[1]] }, rows = FC.forecastRows(fb, FC.run(fb).months).map((r) => r.label)
  check('forecast table: own lines under Revenue, with what is left as Other', rows.slice(0, 4).join('|') === 'Revenue|Core|New product|Other revenue' && FC.partParentOf('Hosting (in Product & engineering)') === 'rnd' && FC.partParentOf('Credit line (in One-off items)') === 'items', rows.slice(0, 5).join('|'))
  const lay = S.layouts(grids)[0], sug = S.suggestMapping(lay.rows, 'forecast')
  check('forecast: a linked "(in Revenue)" row is suggested as its own line under Revenue', S.suggestMapping([{ label: 'Subscriptions (in Revenue)', values: {} }, { label: 'Revenue', values: {} }], 'forecast').map((m) => m.to).join(',') === 'part:revenue,revenue')
  check('forecast template rows link by name', ['revenue', 'cogs', 'payroll', 'items', 'customers'].every((k) => sug.some((m) => m.to === k)) && !sug.some((m) => /Gross profit|Net income/.test(m.label) && m.to), sug.filter((m) => m.to).map((m) => m.label + '→' + m.to).join(', '))
}

// 9b. Stage Monitor: stages, health and the default-alive month from a company's own months.
{
  const ST = await jiti.import(join(root, 'shared/stage.ts'))
  const rr = ST.DEFAULT_RULES.regions.us, cap = { has: true, raised_usd: 900000, priced_round: null, founders_pct: 70, pool: true, safes: 3 }
  const mk = (rev, exp, cash) => rev.map((r, k) => ({ month: '2026-0' + (k + 1), revenue: r, expenses: exp[k], net: r - exp[k], ebitda: r - exp[k], gross_margin: 60, cash: cash[k], debt: null }))
  const base = { usd: 1, cash_at: '2026-06-30', cap, nrr: null, retention_on: false, room: { deck: true, files: 3, links: 1 }, bank: { connected: false, months: 0 } }
  const grow = { ...base, months: mk([50, 60, 72, 86, 100, 120].map((x) => x * 1000), [150, 150, 152, 152, 155, 155].map((x) => x * 1000), [3e6, 2.9e6, 2.8e6, 2.7e6, 2.6e6, 2.5e6]), runway: 70, cash: 2.5e6 }
  const a = ST.defaultAlive(grow)
  check('stage: funding stage from money raised, or the priced round', ST.fundingStage(cap, rr) === 'pre_seed' && ST.fundingStage({ ...cap, priced_round: ST.classStage('Series A Preferred') }, rr) === 'series_a' && ST.classStage('Seed Preferred') === 'seed')
  check('stage: operating stage from the run rate', ST.operatingStage(0, rr) === 'pre_revenue' && ST.operatingStage(1.44e6, rr) === 'seed' && ST.operatingStage(2e6, rr) === 'series_a')
  check('stage: a fast-growing company is default alive', !!a && !!a.cross && !a.zero && ST.health(grow, a) === 'default_alive', a ? a.cross + ' ' + a.zero : 'none')
  const flat = { ...base, months: mk([50, 48, 46, 44].map((x) => x * 1000), [150, 150, 150, 150].map((x) => x * 1000), [5e5, 4e5, 3e5, 2e5]), runway: 2, cash: 2e5 }
  check('stage: under three months of cash is critical; revenue down three months is struggling', ST.health(flat, ST.defaultAlive(flat)) === 'critical' && ST.health({ ...flat, runway: 5 }, ST.defaultAlive({ ...flat, cash: 5e5 })) === 'struggling')
  const e = ST.equityScore(grow, rr, ST.DEFAULT_RULES.equity, 'pre_seed'), d = ST.debtScore(grow, ST.DEFAULT_RULES.debt)
  check('stage: readiness scores out of 100, with what moves them up', e.total > 0 && e.total <= 100 && d.total > 0 && d.total <= 100 && ST.movesUp(e, d).length === 3 && ST.movesUp(e, d)[0].gain >= ST.movesUp(e, d)[2].gain, e.total + ' ' + d.total)
}

// 9c. Banking & Treasury: vendors from bank descriptions, and the category before the founder corrects it.
{
  globalThis.plaidOn = () => false
  const TR = await jiti.import(join(root, 'server/utils/treasury.ts'))
  const v1 = TR.vendorKey('POS DEBIT AWS EMEA AWS.AMAZON REF 1042'), v2 = TR.vendorKey('NIP TRF 0123 GOOGLE ADS 99'), v3 = TR.vendorKey('anything', 'Notion Labs')
  check('treasury: vendor names without card and reference noise', v1.key === 'aws emea amazon' && v2.key === 'google ads' && v3.name === 'Notion Labs', [v1.key, v2.key, v3.name].join(' | '))
  check('treasury: first categories from what the payment is', TR.autoCategory('google ads', 'NIP TRF GOOGLE ADS', 'out', null) === 'opex_marketing' && TR.autoCategory('aws emea amazon', 'AWS', 'out', null) === 'opex_rnd' && TR.autoCategory('acme', 'TRF FROM CUSTOMER ACME', 'in', null) === 'revenue' && TR.autoCategory('deel payroll', 'DEEL PAYROLL', 'out', null) === 'opex_payroll')
}

// 9c2. The company's own names are transfers, not vendors; a customer's payment that names the company is not.
{
  globalThis.currentOrg = async () => ({ name: 'Termii Inc', settings: {} })
  globalThis.db = () => ({ query: async () => ({ rows: [{ name: 'Termii Webtech Limited', legal_name: null }, { name: 'Termii Inc', legal_name: 'Termii, Inc.' }] }) })
  const TR = await jiti.import(join(root, 'server/utils/treasury.ts'))
  const own = await TR.ownNames(), k = (d) => TR.vendorKey(d).key
  check('treasury: payments to and from the company\'s own companies are transfers', TR.isOwn(own, k('Transfer to Termii Inc')) && TR.isOwn(own, k('TERMII WEBTECH LTD')) && TR.isOwn(own, k('ACH TRF FROM TERMII INC 0099')), [k('Transfer to Termii Inc'), k('TERMII WEBTECH LTD'), String(own)].join(' | '))
  check('treasury: a customer payment naming the company stays revenue', !TR.isOwn(own, k('NIP/ZENITH/Acme Corp/TERMII WEBTECH LTD INV 12')) && !TR.isOwn(own, k('AWS EMEA')), k('NIP/ZENITH/Acme Corp/TERMII WEBTECH LTD INV 12'))
  delete globalThis.db; delete globalThis.currentOrg
}

// 9c3. The bank template: its example rows are skipped, real rows read with their balances.
{
  const BP = await jiti.import(join(root, 'server/utils/bank-parse.ts'))
  const csv = 'Date,Description,Money in,Money out,Balance,Who spent\n2026-09-01,EXAMPLE Acme Ltd invoice 1042 (delete this row),2500.00,,12500.00,\n2026-09-02,Acme Ltd invoice 7,1000,,11000,\n2026-09-03,AWS,,250.50,10749.50,Ada\n'
  const r = BP.parseCsv(csv, 'USD')
  check('bank template: example rows skipped, money in and out and balance read', r.txns.length === 2 && r.txns[0].amount === 1000 && r.txns[1].amount === -250.5 && r.txns[1].balance === 10749.5, JSON.stringify(r.txns))
  // A comma file whose narration has a semicolon (eTranzact inflows on Zenith): the columns must not shift.
  const zc = 'Date,Description,Money in,Money out,Balance\n15/11/2025,:ETZ INFLOW 09FG25:Transfer from SAMUEL B; 09048625941,50000.00,,1050000.00\n16/11/2025,AWS,,1000.00,1049000.00\n'
  const zr = BP.parseCsv(zc, 'NGN')
  check('bank csv: a semicolon inside a comma file does not shift the columns', zr.txns.length === 2 && zr.txns[0].amount === 50000 && zr.txns[0].balance === 1050000 && zr.txns[1].amount === -1000, JSON.stringify(zr.txns))
  check('bank csv: a semicolon file is still read', BP.parseCsv('Date;Description;Money in;Money out;Balance\n15/11/2025;Acme, invoice 4;1.000,00;;5000\n'.replace('1.000,00', '1000'), 'NGN').txns[0].amount === 1000)
  // Any other layout: title rows above the headings, a DR/CR type column, Excel serial dates; read with the AI's map.
  const rows = [['GTBank Statement of Account'], ['Account', '0123'], [], ['Tran Date', 'Ref', 'Narration', 'Amount', 'Type', 'Bal'], ['46266', 'R1', 'NIP FROM ACME', '1,000.00', 'CR', '5,000.00'], ['46267', 'R2', 'AWS', '250.50', 'DR', '4,749.50'], ['', '', 'Closing balance', '', '', '4,749.50']]
  const mr = BP.parseRows(rows, 'NGN', { header_row: 3, date: 0, description: [2, 1], amount: 3, debit: null, credit: null, direction: 4, out_words: ['DR'], balance: 5, date_order: null })
  check('bank statement in any layout: read with the column map (type column, serial dates, title rows)', mr.txns.length === 2 && mr.txns[0].amount === 1000 && mr.txns[1].amount === -250.5 && mr.txns[0].date === '2026-09-01' && mr.opening === 4000 && mr.closing === 4749.5 && mr.txns[1].description === 'AWS · R2', JSON.stringify(mr))
  let fell = false; try { BP.parseRows(rows, 'NGN') } catch { fell = true }
  check('bank statement in another layout: the fixed headings do not guess', fell || BP.parseRows(rows, 'NGN').txns.length === 0)
  const GI = await jiti.import(join(root, 'server/utils/growth-import.ts'))
  const t = GI.tableOf([{ name: 'S', rows: csv.trim().split('\n').map((l) => l.split(',')) }])
  const m = await GI.mapTable('bank_txns', t, {})
  check('bank template as a sheet: every column found', m.columns.date === 0 && m.columns.description === 1 && m.columns.credit === 2 && m.columns.debit === 3 && m.columns.balance === 4 && m.columns.spender === 5 && m.all_out === false, JSON.stringify(m.columns))
}

// 9c3b. Brokerage month-end valuations (a Schwab statement's figures) and how brokerage payments are categorised.
{
  const BK = await jiti.import(join(root, 'server/utils/brokerage.ts'))
  const csv = 'Month end,Cash (USD),Treasuries & fixed income at market value (USD),Total account value (USD),Accrued interest (USD),Total incl. accrued interest (USD)\n2023-10-31,125843.44,888346.09,1014189.53,1355.71,1015545.24\n2024-12-31,193975.31,862594.24,1056569.55,,\n2026-09-30,1202.93,105189.29,106392.22,1000.81,107393.03\n'
  const rows = csv.trim().split('\n').map((l) => l.split(','))
  const v = BK.parseValuations(rows), last = v[v.length - 1]
  check('brokerage: valuation columns found (cash, holdings, total, accrued; not the total with interest)', v.length === 3 && last.month_end === '2026-09-30' && last.cash === 1202.93 && last.holdings === 105189.29 && last.total === 106392.22 && last.accrued === 1000.81 && v[1].accrued === null, JSON.stringify(v))
  check('brokerage: every month adds up (cash + holdings = total)', v.every((x) => Math.abs(x.cash + x.holdings - x.total) <= 1))
  const t = (d) => BK.brokerageCategory(d)
  check('brokerage: buying, redemptions and maturities are investment; interest income; advisor fee a cost; MoneyLink a transfer',
    t('Bought 50,000 US TREASURY NOTE') === 'investment' && t('Full Redemption US TREASURY BILL') === 'investment' && t('CD Maturity ALLY BANK') === 'investment' && t('Bond Interest US TREASURY') === 'other_income' && t('Credit Interest') === 'other_income' && t('Advisor Fee') === 'opex_ga' && t('Withdrawal - Funds Paid MoneyLink Transfer JPMORGAN') === 'transfer' && t('Deposit - MoneyLink') === 'transfer',
    ['Bought', 'Full Redemption', 'CD Maturity', 'Bond Interest', 'Credit Interest', 'Advisor Fee', 'Withdrawal', 'Deposit'].map((d) => d + '=' + t(d)).join(' '))
}

// 9c4. Cards and loans from the live feed are money owed, not cash.
{
  const B = await jiti.import(join(root, 'shared/bank.ts'))
  check('bank: a card or loan is owed, a checking or savings account is cash', B.isDebt({ type: 'credit', subtype: 'credit card' }) && B.isDebt({ type: 'loan', subtype: 'business' }) && B.isCard({ type: 'credit', subtype: 'credit card' }) && !B.isDebt({ type: 'depository', subtype: 'checking' }) && !B.isDebt({ type: 'depository', subtype: 'savings' }) && B.CARD_PAY.test('BREX CARD PAYMENT') && !B.CARD_PAY.test('AWS EMEA'))
}

// 9c5. Plaid notices: only a valid, fresh signature over this exact body is accepted.
{
  const { generateKeyPairSync, sign, createHash } = await import('node:crypto')
  const PS = await jiti.import(join(root, 'server/utils/plaid-sync.ts'))
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' }), jwk = publicKey.export({ format: 'jwk' })
  const body = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'x' })
  const mk = (claims) => { const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'k1' })).toString('base64url'), p = Buffer.from(JSON.stringify(claims)).toString('base64url'); return h + '.' + p + '.' + sign('sha256', Buffer.from(h + '.' + p), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') }
  const sha = createHash('sha256').update(body).digest('hex'), now = Date.now(), get = async () => jwk
  const good = await PS.plaidWebhookVerified(body, mk({ iat: Math.floor(now / 1000), request_body_sha256: sha }), get, now)
  const tampered = await PS.plaidWebhookVerified(body.replace('x', 'y'), mk({ iat: Math.floor(now / 1000), request_body_sha256: sha }), get, now)
  const stale = await PS.plaidWebhookVerified(body, mk({ iat: Math.floor(now / 1000) - 900, request_body_sha256: sha }), get, now)
  check('plaid notices: a valid signature passes; a changed body or an old notice does not', good && !tampered && !stale, [good, tampered, stale].join(' '))
}

// 9e. Bringing bank sheets into Banking: columns by heading, card exports read as payments.
{
  globalThis.useRuntimeConfig = () => ({})
  const GI = await jiti.import(join(root, 'server/utils/growth-import.ts'))
  const b = await GI.mapTable('bank_txns', GI.tableOf([{ name: 'S', rows: [['Txn Date', 'Narration', 'Withdrawals', 'Lodgements', 'Balance'], ['01/09/2026', 'NIP TRF', '1,000', '', '9,000']] }]), {})
  check('import: bank columns, money in and out', b.columns.date === 0 && b.columns.description === 1 && b.columns.debit === 2 && b.columns.credit === 3 && GI.dateOf('01/09/2026') === '2026-09-01' && GI.dateOf(46000) === '2025-12-09', JSON.stringify(b.columns))
  const card = GI.tableOf([{ name: 'Payments', rows: [['Date', 'User', 'Card last 4', 'Amount ($)', 'Merchant', 'Flag', 'Category'], ['2026-10-14', 'Emmanuel', '8328', 1705.76, 'Wise', 'REVIEW', 'Transfer'], ['2026-10-09', 'Emmanuel', '6730', -47.32, 'Intuit', 'KEEP', 'Software'], ['2026-10-08', 'Atinuke', '3608', 104, '360dialog', 'KEEP', 'COGS'], ['2026-10-02', 'Emmanuel', '6730', 9302.64, 'Google Cloud', 'CRITICAL', 'Infra'], ['2026-10-01', 'Awe', '2971', 2004.94, 'Raenest', 'KEEP', 'Payroll']] }])
  const cm = await GI.mapTable('bank_txns', card, {})
  check('card export: merchant, who spent and amount found; read as payments', cm.columns.date === 0 && cm.columns.spender === 1 && cm.columns.amount === 3 && cm.columns.description === 4 && cm.all_out === true, JSON.stringify(cm))
}

// 9g. The live market strip: Treasury bill CSV, New York Fed rates, Alpaca snapshots and US market hours.
{
  globalThis.alpacaReady = () => false
  const MT = await jiti.import(join(root, 'server/utils/market-ticker.ts'))
  const csv = 'Date,"4 WEEKS BANK DISCOUNT","4 WEEKS COUPON EQUIVALENT","13 WEEKS BANK DISCOUNT","13 WEEKS COUPON EQUIVALENT"\n10/24/2026,4.02,4.10,3.95,4.07\n10/23/2026,4.03,4.11,3.97,4.09\n'
  const t = MT.tbillFromCsv(csv)
  check('ticker: 3-month T-bill from the Treasury file, change in points', t.length === 1 && t[0].value === 4.07 && t[0].change === -0.02 && t[0].as_of === '10/24/2026', JSON.stringify(t))
  const e = MT.effrFromJson({ refRates: [{ effectiveDate: '2026-10-23', percentRate: 4.33 }, { effectiveDate: '2026-10-22', percentRate: 4.33 }] })
  check('ticker: Fed funds from the New York Fed, unchanged', e.length === 1 && e[0].value === 4.33 && e[0].change === 0, JSON.stringify(e))
  const s = MT.fromSnapshots({ SPY: { latestTrade: { p: 588.4, t: '2026-10-26T17:42:05Z' }, prevDailyBar: { c: 589.87 } }, QQQ: undefined }, { SPY: 'S&P 500 (SPY)', QQQ: 'Nasdaq 100 (QQQ)' }, 'usd', 'Alpaca')
  check('ticker: Alpaca snapshot against yesterday, missing symbols left out', s.length === 1 && s[0].change === -0.25, JSON.stringify(s))
  check('ticker: US market hours in New York time', MT.usMarketOpen(new Date('2026-10-26T15:00:00Z')) && !MT.usMarketOpen(new Date('2026-10-26T21:30:00Z')) && !MT.usMarketOpen(new Date('2026-10-25T15:00:00Z')))
  check('ticker: no Yahoo source', !readFileSync(join(root, 'server/utils/market-ticker.ts'), 'utf8').includes('yahoo.com'))
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

// 11. The Aidi portfolio report template, filled in by a founder, read with no AI.
{
  const BL = await jiti.import(join(root, 'server/utils/brand-logos.ts')); Object.assign(globalThis, { LOGO_PNG: BL.LOGO_PNG })
  const PT = await jiti.import(join(root, 'server/utils/portfolio-template.ts'))
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); await wb.xlsx.load(await PT.portfolioTemplateWorkbook({ company: 'Acme', months: 3 }))
  const ws = wb.getWorksheet('Figures'); ws.getCell('B3').value = 'NGN'
  const rowOf = (l) => { let n = 0; ws.eachRow((r, i) => { if (r.getCell(1).value === l) n = i }); return n }
  const set = (l, vals) => vals.forEach((v, k) => { ws.getRow(rowOf(l)).getCell(2 + k).value = v })
  set('Revenue', [1000000, 1100000, 1200000]); set('Net burn per month', [-500000, 450000, 400000]); set('Cash at the end', [9e6, 8.5e6, 8e6]); set('Paying customers', [10, 11, 12])
  ws.getRow(rowOf('KPI: Runway (months)')).getCell(4).value = 20
  const nt = wb.getWorksheet('Notes'); nt.getCell('B4').value = 'Signed two banks.'
  const r = PT.readPortfolioTemplate(await S.readGrids(Buffer.from(await wb.xlsx.writeBuffer()), 'xlsx'), 'Acme')
  const last = r?.periods[r.periods.length - 1]
  check('portfolio template read with no AI', !!r && r.currency === 'NGN' && r.periods.length === 3 && last.revenue_total === 1200000 && r.periods[0].net_burn_monthly === 500000 && last.customers === 12, r ? r.periods.map((p) => p.month + ':' + p.revenue_total).join(' ') : 'not read')
  check('portfolio template: KPIs and notes', r?.other_kpis.some((k) => k.name === 'Runway (months)' && k.value === 20) && r?.highlights === 'Signed two banks.', JSON.stringify(r?.other_kpis) + ' ' + r?.highlights)
}

// 12. Prepaid credits / pay as you go: a quiet month is not a lost customer when it is within the grace months.
{
  const M = await jiti.import(join(root, 'shared/customer-metrics.ts'))
  const c = { id: 'a', name: 'A', segment: null, sector: null, country: null, plan: null, started_on: null, acquisition_cost: null, gross_margin_pct: null, rev: { '2026-01': 300, '2026-03': 300, '2026-05': 300 } }
  const ms = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
  const b1 = M.bridge([c], ms, 1), b3 = M.bridge([c], ms, 3)
  check('subscription: every quiet month is a lost and won customer', b1.reduce((s, x) => s + x.lost_logos, 0) === 3 && b1.reduce((s, x) => s + x.reactivated, 0) === 600)
  check('prepaid (3 quiet months allowed): never lost, always active', b3.every((x) => x.lost_logos === 0 && x.active === 1), JSON.stringify(b3.map((x) => [x.month, x.lost_logos, x.active])))
}

// 13. Intercompany eliminations in the group view (Termii, Aug 2026: Termii Inc in USD, Webtech in NGN at 1,355).
{
  const IC = await jiti.import(join(root, 'server/utils/intercompany.ts'))
  const KEYS = ['revenue', 'cogs', 'gross_profit', 'opex_other', 'opex_total', 'ebitda', 'net_income', 'cash', 'other_assets', 'total_assets', 'other_liabilities', 'total_liabilities', 'equity']
  const us = { rate: 1, lines: { cash: 34992, other_assets: 1838366, total_assets: 1973358, other_liabilities: 5184592, total_liabilities: 5184592, equity: -3211234 },
    detail: { 'other_assets|Intercompany receivable – Termii Webtech': 764857, 'other_liabilities|SAFE notes (convertible)': 5013700 } }
  const ng = { rate: 1 / 1355, lines: { cash: 1068273740, other_assets: 789394261, total_assets: 1857668001, other_liabilities: 1199470669, total_liabilities: 1539615669, equity: 318052332 },
    detail: { 'other_liabilities|Intercompany payable – Termii Inc': 857236592, 'other_assets|Intercompany receivable – Termii Inc': 76350401 } }
  const { lines, eliminated: e } = IC.consolidate([us, ng], KEYS)
  check('intercompany: group balance sheet still balances', Math.abs(lines.total_assets - lines.total_liabilities - lines.equity) < 1, String(lines.total_assets - lines.total_liabilities - lines.equity))
  check('intercompany: receivables and payables taken out', e.receivables === Math.round((764857 + 76350401 / 1355) * 100) / 100 && e.payables === Math.round((857236592 / 1355) * 100) / 100, e.receivables + ' / ' + e.payables)
  check('intercompany: the two sides disagree by about $189k and it is reported', Math.abs(e.unreconciled - 188557) < 1, String(e.unreconciled))
  const p = { rate: 1, lines: { revenue: 1000, gross_profit: 1000, ebitda: 1000, net_income: 1000 }, detail: { 'revenue|Intercompany management fee': 200 } }
  const sb = { rate: 1, lines: { revenue: 500, gross_profit: 500, opex_other: 300, opex_total: 300, ebitda: 200, net_income: 200 }, detail: { 'opex_other|Intercompany management fee': 200 } }
  const g = IC.consolidate([p, sb], KEYS).lines
  check('intercompany: a management fee leaves revenue and costs, profit unchanged', g.revenue === 1300 && g.opex_total === 100 && g.net_income === 1200, JSON.stringify(g))
  check('intercompany: other categories stay in', IC.consolidate([{ rate: 1, lines: { other_assets: 10, total_assets: 10, equity: 10 }, detail: { 'other_assets|Loans receivable': 10 } }], KEYS).eliminated.items.length === 0)
  check('intercompany: a category ticked by the company counts', IC.isIntercompany('Loan to Webtech', new Set(['loan to webtech'])) && !IC.isIntercompany('Loan to Webtech'))
}

// 13b. A company whose lines do not add up to its own total: categories folded into missing lines, the rest carried
// as "other" and named (Termii Inc: SAFE notes and credit cards saved under a line it did not give).
{
  const IC = await jiti.import(join(root, 'server/utils/intercompany.ts'))
  const K = ['cash', 'payables', 'debt', 'other_liabilities', 'total_liabilities', 'total_assets', 'equity']
  const m = { rate: 1, who: 'Termii Inc', lines: { cash: 100, total_assets: 100, payables: 300, total_liabilities: 1000, equity: -900 }, detail: { 'debt|SAFE notes (convertible)': 500 } }
  const { lines, eliminated: e } = IC.consolidate([m], K)
  check('group: a category under a line the company did not give is folded in', lines.debt === 500, String(lines.debt))
  check('group: the rest of the gap is other liabilities and named', lines.other_liabilities === 200 && e.gaps.length === 1 && e.gaps[0].who === 'Termii Inc' && e.gaps[0].side === 'liabilities' && e.gaps[0].value === 200, JSON.stringify(e.gaps))
  check('group: liability lines add up to the total again', lines.payables + lines.debt + lines.other_liabilities === lines.total_liabilities)
}

// 13c. Burn with treasury bills counted as cash: selling them is not cash coming in.
{
  const V = await jiti.import(join(root, 'shared/fin-view.ts'))
  const mk = (m, inv, invcf) => ({ period_end: new Date(Date.UTC(2026, m, 0)).toISOString().slice(0, 10), period_type: 'month', currency: 'USD', kpis: {}, lines: { revenue: 100000, net_income: -80000, operating_cf: -80000, investing_cf: invcf, cash: 500000, investments: inv } })
  const rows = [mk(5, 300000, 0), mk(6, 300000, 0), mk(7, 157000, 143000), mk(8, 157000, 0)].map((r) => ({ ...r, derived: V.withSecurities(V.deriveLines(r.lines, 1), true) }))
  const on = V.burnReview(rows, (d) => d.cash, { securities: true })
  const plain = V.burnReview(rows.map((r) => ({ ...r, derived: V.deriveLines(r.lines, 1) })))
  const off = V.burnReview(rows.map((r) => ({ ...r, derived: V.deriveLines(r.lines, 1) })), undefined, { securities: false })
  check('burn: T-bill sales left out when securities count as cash', Math.round(on.methods[0].value) === 80000 && on.burn === 80000, String(on.methods[0].value))
  check('burn: T-bill sales left out even where the page shows cash without them (Financials)', Math.round(plain.methods[0].value) === 80000 && plain.cash === 657000, plain.methods[0].value + ' ' + plain.cash)
  check('burn: the older reading still available', Math.round(off.methods[0].value) === Math.round((240000 - 143000) / 3), String(off.methods[0].value))
}

// 14. KPIs in the group view (Termii, Jun 2026: Webtech in NGN at 1,380, Termii Inc in USD).
{
  const K = await jiti.import(join(root, 'server/utils/kpi-consolidate.ts'))
  const webtech = { rate: 1 / 1380, kpis: { 'Paying customers': 2768, 'New paying customers': 372, 'CAC related costs': 2850528.5, 'CAC per new paying customer': 7662.7, Headcount: 65, 'Transactions (messages and calls)': 94965967, 'End users reached': 14996671, 'Registered business accounts': 42964 } }
  const inc = { rate: 1, kpis: { 'Paying customers': 179, 'New paying customers': 101, 'CAC related costs': 2528.1, 'CAC per new paying customer': 25.0, Headcount: 1 } }
  const g = K.consolidateKpis([webtech, inc])
  check('group KPIs: counts added', g.Headcount === 66 && g['New paying customers'] === 473 && g['Paying customers'] === 2947, JSON.stringify([g.Headcount, g['New paying customers'], g['Paying customers']]))
  check('group KPIs: a KPI only one company reports is kept as it is', g['Transactions (messages and calls)'] === 94965967)
  check('group KPIs: money converted, then added', g['CAC related costs'] === Math.round((2850528.5 / 1380 + 2528.1) * 100) / 100, String(g['CAC related costs']))
  check('group KPIs: a ratio is worked out again from the totals, not added', g['CAC per new paying customer'] === Math.round((g['CAC related costs'] / 473) * 100) / 100, String(g['CAC per new paying customer']))
  check('group KPIs: kinds by name, and the company\'s own rule wins', K.kpiRule('Gross margin %') === 'ratio' && K.kpiRule('MRR') === 'money' && K.kpiRule('Active users') === 'sum' && K.kpiRule('NPS', { NPS: 'average' }) === 'average')
  check('group KPIs: a ratio without its parts is left out, never added', K.consolidateKpis([{ rate: 1, kpis: { 'Revenue per user': 5 } }, { rate: 1, kpis: { 'Revenue per user': 7 } }])['Revenue per user'] === undefined)
}

// 15. Book rates from an "FX rates" tab: a month column and a rate column under "NGN per 1 USD (book rates used)".
{
  const CI = await jiti.import(join(root, 'server/utils/customer-import.ts'))
  const g = [{ name: 'FX rates', rows: [['NGN per 1 USD (book rates used)', null], ['2026-07-01', 1368], ['2026-08-01', 1355]] }]
  const r = CI.fileRates(g)
  check('book rates read from a two-column FX rates tab', r.get('NGN')?.get('2026-07') === 1368 && r.get('NGN')?.get('2026-08') === 1355, JSON.stringify([...(r.get('NGN') ?? new Map())]))
}

// 16. Public Markets valuation maths against the spec's fixtures (to 0.1%), and the pieces checked against each other.
{
  const Q = await jiti.import(join(root, 'shared/quant.ts'))
  const near = (a, b, tol = 0.001) => Math.abs(a - b) <= Math.abs(b) * tol
  check('PEP cost of equity 4.5% + 0.67 × 3.5% = 6.8%', Math.round(Q.costOfEquity(4.5, 0.67, 3.5) * 10) / 10 === 6.8)
  check('NVDA cost of equity 4.5% + 1.56 × 3.5% = 10.0%', Math.round(Q.costOfEquity(4.5, 1.56, 3.5) * 10) / 10 === 10.0)
  check('Qualcomm WACC with no debt 4.25% + 1.25 × 5% = 10.5%', Q.wacc({ equity: 100, debt: 0, re: Q.costOfEquity(4.25, 1.25, 5), rd: 5, tax: 21 }) === 10.5)
  const np = [-33.8, 11.6, 17.6, 17.6, 17.6, 6.0]
  check('NetPhone NPV at 10.5% = 19.60m', Math.round(Q.npv(10.5, np) * 100) / 100 === 19.6, String(Q.npv(10.5, np)))
  check('NetPhone IRR = 32.1%', Math.round(Q.irr(np) * 10) / 10 === 32.1, String(Q.irr(np)))
  check('NetPhone expected NPV 75/10/15 = 11.7m', Math.round(Q.expectedValue([{ p: 75, v: 19.6 }, { p: 10, v: -24.75 }, { p: 15, v: -3.74 }]) * 10) / 10 === 11.7)
  // McDonald's (Jan 2019): the terminal value of 206,707 at 5.5% for ten years, and TEV 170,183 to equity 139,962 and
  // $182.96 a share. The ten years of free cash flow come from the sheet, which is not in the repo yet.
  const pvTv = Q.pvAt(206707, 5.5, 10)
  check('McDonald\'s terminal value 206,707 at 5.5% over 10 years = 121,013 today', Math.round(pvTv) === 121013, String(pvTv))
  check('McDonald\'s TEV 170,183 less net debt 30,221 over 765.0m shares = $182.96', near(Q.perShare(170183, 170183 - 139962, 139962 / 182.96), 182.96, 0.0001))
  // Beta: a made-up stock moving 0.8 × the market plus noise; the regression finds 0.8 and the adjustment pulls to 1.
  const px = (f) => { const out = []; let p = 100; for (let i = 0; i < 61; i++) { p *= 1 + f(i); out.push({ d: new Date(Date.UTC(2021, i, 28)).toISOString().slice(0, 10), close: p }) } return out }
  const mk = (i) => Math.sin(i * 1.7) * 0.04 + 0.005, st = (i) => 0.002 + 0.8 * (mk(i) - 0.003) + 0.003 + Math.cos(i * 2.3) * 0.005
  const b = Q.betaOf(px(st), px(mk), Object.fromEntries(Array.from({ length: 61 }, (_, i) => [new Date(Date.UTC(2021, i, 28)).toISOString().slice(0, 7), 3.6])), 60, '2026-02')
  check('beta from monthly excess returns', b && Math.abs(b.beta - 0.8) < 0.02 && b.r2 > 0.9 && b.months === 60 && b.ci[0] < b.beta && b.ci[1] > b.beta, b ? [b.beta, b.r2, b.months].join(' ') : 'none')
  check('Blume adjusted beta 0.67 × 0.6 + 0.33', Math.round(Q.blume(0.6) * 1000) / 1000 === 0.732)
  check('beta needs 36 months', Q.betaOf(px(st).slice(0, 30), px(mk).slice(0, 30), { '2021-01': 3 }, 60, '2026-02') === null)
  // DCF: value, reverse DCF and break-evens agree with each other.
  const d = Q.seedDrivers({ revenue: [100, 110, 121, 133.1], ebit: [10, 11, 12.1, 13.3], tax_rate: [21, 21, 21], reinvest: [3, 3, 3], nwc: [5, 5, 5] })
  check('starting growth: last three years\' median, fading to long-run growth by year 10', d.growth[0] === 10 && d.growth[2] === 10 && d.growth[9] === 2.5 && d.margin[0] === 10)
  const v = { base: { revenue: 133.1, ebit: 13.3 }, netDebt: 10, shares: 10, wacc: 8, rfLong: 4.2 }
  const one = Q.dcf(v.base, d, 8, 4.2), byHand = one.rows.reduce((a, r) => a + r.fcf / 1.08 ** r.year, 0) + (one.rows[9].fcf * 1.025 / (0.08 - 0.025)) / 1.08 ** 10
  check('DCF: PV of ten years plus the terminal value', near(one.ev, byHand, 1e-9) && near(Q.valuePerShare(v, d), (one.ev - 10) / 10, 1e-9))
  const price = 12, g = Q.impliedGrowth(v, d, price)
  check('reverse DCF: the growth found gives back the price', g !== null && near(Q.valuePerShare(v, { ...d, growth: Array(10).fill(g) }), price, 1e-6), String(g))
  const tw = Q.tornado(v, d, price), w = tw.find((x) => x.key === 'wacc')
  check('break-even WACC gives back the price', w.break_even !== null && near(Q.valuePerShare(v, d, w.break_even), price, 1e-6) && tw[0].swing >= tw[tw.length - 1].swing, String(w.break_even))
  check('no value when long-run growth is within 1 point of the WACC', Q.dcf(v.base, { ...d, terminal_growth: 7.5 }, 8) === null)
  const sc = Q.scenarios(v, d)
  check('scenarios: bear < base < bull, weighted 25/50/25', sc.bear < sc.base && sc.base < sc.bull && near(sc.weighted, 0.25 * sc.bear + 0.5 * sc.base + 0.25 * sc.bull, 1e-9))
  check('signal: margin of safety bands', Q.signalOf(30, 12, 7, true) === 'strong_buy' && Q.signalOf(30, 12, 7, false) === 'buy' && Q.signalOf(5, 8, 7, true) === 'hold' && Q.signalOf(-15, 3, 7, true) === 'trim' && Q.signalOf(-30, 0, 7, true) === 'sell')
  check('expected return: cost of equity when price equals value', near(Q.expectedReturn(100, 100, 7, 3), 7, 1e-9))
  check('drawdown and volatility', Q.maxDrawdown([{ d: '2026-01-01', close: 100 }, { d: '2026-01-02', close: 120 }, { d: '2026-01-03', close: 90 }, { d: '2026-01-04', close: 130 }]) === -25 && Q.volatility(Array.from({ length: 40 }, (_, i) => ({ d: '2026-01-' + String(i + 1).padStart(2, '0'), close: 100 })), 30) === 0)
}

console.log(failed ? '\n' + failed + ' check(s) failed' : '\nAll sheet checks passed')
process.exit(failed ? 1 : 0)
