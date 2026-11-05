// node --experimental-strip-types tests/bs-classify.test.ts
// Termii Inc, 30 Sep 2026 (QuickBooks: total assets 1,959,230; liabilities 200,259; equity 1,758,972 with SAFEs in equity).
// @ts-ignore TS5097: Node runs this file directly, so the import names the .ts file.
import { classifyBalance, classifiedRows, periodDetail, safeNote } from '../shared/bs-classify.ts'

let fail = 0
const eq = (a: unknown, b: unknown, what: string) => { const ok = typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.01 : a === b; if (!ok) { fail++; console.error('FAIL', what, a, '!=', b) } else console.log('ok  ', what) }

const lines = { cash: 19039.86, investments: 105189.29, long_term_investments: 484990, other_assets: 1350980.18, total_assets: 1959230.33,
  payables: 24649.52, debt: 36005.7, other_liabilities: 5153303.31, total_liabilities: 5213958.53, equity: -3254728.2 }
const asLiability = { 'other_assets|Prepaid expenses': 51266.75, 'other_assets|Intercompany receivable – Termii Webtech': 728546.41, 'other_assets|Related-party receivables': 19005.93,
  'other_assets|Loans receivable': 294150, 'other_assets|Notes receivable – startup lending program': 196025, 'other_assets|Property, plant & equipment': 23072.09,
  'other_assets|Intangible assets & certifications': 37945, 'other_liabilities|Accrued expenses & payroll': 3778.47,
  'other_liabilities|Customer prepayments – unused credits (deferred revenue)': 135824.98, 'other_liabilities|SAFE notes (convertible)': 5013699.86,
  'equity|Treasury stock (share buyback)': -49272.28, 'equity|Unrealized investment gains/loss': 48922.82, 'equity|Other equity reserves': -2969.08,
  'equity|Related-party balances': -445.27, 'equity|Retained earnings (deficit)': -3250964.39 }

// As imported (SAFE in other liabilities), no setting: totals as given.
const a = classifyBalance(lines, asLiability)
eq(a.totals.ta, 1959230.33, 'total assets unchanged')
eq(a.totals.tl, 5213958.53, 'total liabilities as imported')
eq(a.totals.eq, -3254728.2, 'equity as imported')
eq(a.items.find((i) => i.label.startsWith('Notes receivable'))?.group, 'nca', 'notes receivable non-current')
eq(a.items.find((i) => i.label.startsWith('Property'))?.group, 'nca', 'PPE non-current')
eq(a.items.find((i) => i.label === 'Loans receivable')?.group, 'ca', 'loans receivable current (QuickBooks: other current assets)')
eq(a.items.find((i) => i.key === 'long_term_investments')?.group, 'nca', 'long-term investments non-current')
eq(a.items.find((i) => i.key === 'debt')?.group, 'cl', 'Fundbox (debt, no category) current')

// The company chooses equity: liabilities and equity match QuickBooks; total assets unchanged; still balances.
const b = classifyBalance(lines, asLiability, { safe: 'equity' })
eq(b.totals.tl, 200258.67, 'liabilities with SAFEs in equity = QuickBooks')
eq(b.totals.eq, 1758971.66, 'equity with SAFEs in equity')
eq(b.totals.ta - b.totals.tl - b.totals.eq, 0, 'still balances')
eq(b.safeMoved, 5013699.86, 'amount moved reported')
eq(b.totals.cl, 200258.67, 'all liabilities current')
eq(b.workingCapital, b.totals.ca - b.totals.cl, 'working capital')

// SAFEs already in equity in the sheet, company wants liability (US GAAP): moved the other way.
const inEq = { ...asLiability } as Record<string, number>
delete inEq['other_liabilities|SAFE notes (convertible)']; inEq['equity|SAFE notes (convertible, equity)'] = 5013699.86
const l2 = { ...lines, other_liabilities: 139603.45, total_liabilities: 200258.67, equity: 1758971.66 }
const c = classifyBalance(l2, inEq, { safe: 'liability' })
eq(c.totals.tl, 5213958.53, 'SAFE moved to liabilities')
eq(c.items.find((i) => i.label.startsWith('SAFE'))?.group, 'ncl', 'as a non-current liability')

// No detail at all: lines only, other assets not itemised are non-current.
const d = classifyBalance({ cash: 100, receivables: 50, other_assets: 30, total_assets: 180, payables: 40, total_liabilities: 40, equity: 140 }, null)
eq(d.totals.ca, 150, 'lines only: current assets'); eq(d.totals.nca, 30, 'lines only: other assets non-current'); eq(d.currentRatio, 3.75, 'current ratio')

// Rows for two periods; no note is printed.
const t = classifiedRows([b, a])
eq(t.rows[0]!.label, 'Current assets', 'first heading')
eq(t.rows.find((r) => r.label === 'Total liabilities')!.values[0], 200258.67, 'table: liabilities')
eq(t.rows.find((r) => r.label === 'Total liabilities and equity')!.values[0], 1959230.33, 'table: L+E = assets')
eq(safeNote(t.moved, 'equity', (v) => '$' + Math.round(v).toLocaleString('en-US')), null, 'no note printed (figures as presented)')
// A year still running ends in December: its balance sheet categories come from its latest month.
const ytd = periodDetail([{ period_type: 'month', period_end: '2026-08-31', detail: { 'equity|A': 1 } }, { period_type: 'month', period_end: '2026-09-30', detail: { 'other_liabilities|SAFE and convertible notes': 5, 'opex|Rent': 2 } }, { period_type: 'month', period_end: '2025-12-31', detail: { 'equity|Old': 9 } }], '2026-12-31')
eq(ytd?.['other_liabilities|SAFE and convertible notes'], 5, 'year to date takes the latest month')
eq(ytd?.['equity|A'], undefined, 'only the latest month for the balance sheet')
const q = periodDetail([{ period_type: 'month', period_end: '2026-07-31', detail: { 'opex|Rent': 2 } }, { period_type: 'month', period_end: '2026-08-31', detail: { 'opex|Rent': 3 } }, { period_type: 'month', period_end: '2026-09-30', detail: { 'opex|Rent': 4, 'cash|Bank': 7 } }], '2026-09-30', '2026-07-31')
eq(q?.['opex|Rent'], 9, 'quarter adds up profit and loss categories')
eq(q?.['cash|Bank'], 7, 'quarter balance from its last month')
if (fail) { console.error(fail + ' failed'); process.exit(1) } else console.log('all passed')
