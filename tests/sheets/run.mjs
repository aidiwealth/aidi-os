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

console.log(failed ? '\n' + failed + ' check(s) failed' : '\nAll sheet checks passed')
process.exit(failed ? 1 : 0)
