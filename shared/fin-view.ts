// Financial views shared by the page and the server: roll months up into quarters or years (or any range), the
// figures worked out from the lines, and arithmetic checks that flag where a sheet's own totals do not add up.
export type Lines = Record<string, number | null | undefined>
export interface FinRow { period_end: string; period_type: string; currency: string; lines: Lines; kpis: Record<string, number>; derived: Record<string, number | null>; months?: number; from?: string }

const PL = ['revenue', 'cogs', 'gross_profit', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other', 'opex_total', 'ebitda', 'depreciation', 'interest', 'tax', 'net_income']
const CF = ['operating_cf', 'investing_cf', 'financing_cf']
const FLOWS = new Set([...PL, ...CF])
const OPEX = ['opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other']
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const sum = (...v: (number | null)[]) => (v.some((x) => x !== null) ? v.reduce<number>((a, x) => a + (x ?? 0), 0) : null)

export function deriveLines(lines: Lines, months: number): Record<string, number | null> {
  const g = (k: string) => num(lines[k])
  const gross = g('gross_profit') ?? (g('revenue') !== null ? (g('revenue') ?? 0) - (g('cogs') ?? 0) : null)
  const opex = g('opex_total') ?? sum(...OPEX.map(g))
  const ebitda = g('ebitda') ?? (gross !== null || opex !== null ? (gross ?? 0) - (opex ?? 0) : null)
  const ocf = g('operating_cf'), ni = g('net_income')
  const burn = ocf !== null ? Math.max(0, -ocf / months) : ni !== null ? Math.max(0, -ni / months) : null
  const out: Record<string, number | null> = {}
  for (const k of [...PL, ...CF, 'cash', 'receivables', 'investments', 'other_assets', 'total_assets', 'payables', 'debt', 'other_liabilities', 'total_liabilities', 'equity']) out[k] = g(k)
  out.gross_profit = gross; out.opex_total = opex; out.ebitda = ebitda
  out.gross_margin = gross !== null && g('revenue') ? Math.round((gross / (g('revenue') as number)) * 1000) / 10 : null
  out.burn = burn === null ? null : Math.round(burn)
  out.runway = burn && out.cash !== null ? Math.round(((out.cash as number) / burn) * 10) / 10 : null
  return out
}

const qOf = (d: string) => d.slice(0, 4) + '-Q' + (Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1)
const endOfQ = (key: string) => { const y = Number(key.slice(0, 4)), q = Number(key.slice(-1)); return new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10) }
// Months rolled up: flows (P&L, cash flow) added, balances (cash, assets…) and KPIs taken from the last month.
export function rollUp(rows: FinRow[], by: 'quarter' | 'year'): FinRow[] {
  const groups = new Map<string, FinRow[]>()
  for (const r of rows.filter((x) => x.period_type === 'month')) { const k = by === 'year' ? r.period_end.slice(0, 4) : qOf(r.period_end); groups.set(k, [...(groups.get(k) ?? []), r]) }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, g]) => combine(g, by === 'year' ? k + '-12-31' : endOfQ(k), by))
}
// Any run of months as one period (a custom range).
export function combine(g: FinRow[], end: string, type: string): FinRow {
  const lines: Lines = {}
  const last = g[g.length - 1]!
  for (const r of g) for (const [k, v] of Object.entries(r.lines)) { const x = num(v); if (x === null) continue; lines[k] = FLOWS.has(k) ? (num(lines[k]) ?? 0) + x : x }
  for (const k of Object.keys(lines)) if (!FLOWS.has(k)) lines[k] = num(last.lines[k]) ?? lines[k]
  return { period_end: end, period_type: type, currency: last.currency, lines, kpis: last.kpis, derived: deriveLines(lines, g.length), months: g.length, from: g[0]!.period_end }
}

// Where a period's own totals do not add up (a total typed over, a row left out of a SUM, a sign the wrong way).
export interface Check { period_end: string; period_type: string; what: string; detail: string; diff: number; severity: 'error' | 'warn' }
export function checkRow(r: { period_end: string; period_type: string; lines: Lines }): Check[] {
  const g = (k: string) => num(r.lines[k])
  const out: Check[] = []
  const tol = (base: number | null) => Math.max(2, Math.abs(base ?? 0) * 0.005)
  const fmt = (v: number) => Math.round(v).toLocaleString('en-US')
  const test = (what: string, have: number | null, want: number | null, how: string, severity: Check['severity'] = 'error') => {
    if (have === null || want === null) return
    const d = have - want
    if (Math.abs(d) > tol(want)) out.push({ period_end: r.period_end, period_type: r.period_type, what, detail: how + ': the sheet has ' + fmt(have) + ', the parts add up to ' + fmt(want) + ' (off by ' + fmt(d) + ').', diff: d, severity })
  }
  if (g('revenue') !== null && g('cogs') !== null) test('Gross profit', g('gross_profit'), (g('revenue') ?? 0) - (g('cogs') ?? 0), 'Revenue less cost of revenue')
  const parts = OPEX.map(g)
  if (parts.filter((x) => x !== null).length >= 2) test('Total operating costs', g('opex_total'), sum(...parts), 'The cost lines added up')
  const gp = g('gross_profit') ?? (g('revenue') !== null ? (g('revenue') ?? 0) - (g('cogs') ?? 0) : null)
  const ox = g('opex_total') ?? sum(...parts)
  if (gp !== null && ox !== null) test('EBITDA', g('ebitda'), gp - ox, 'Gross profit less operating costs', 'warn')
  if (g('ebitda') !== null && (g('depreciation') !== null || g('interest') !== null || g('tax') !== null)) test('Net income', g('net_income'), (g('ebitda') ?? 0) - Math.abs(g('depreciation') ?? 0) - Math.abs(g('interest') ?? 0) - Math.abs(g('tax') ?? 0), 'EBITDA less depreciation, interest and tax', 'warn')
  const assets = ['cash', 'receivables', 'investments', 'other_assets'].map(g)
  if (assets.filter((x) => x !== null).length >= 2) test('Total assets', g('total_assets'), sum(...assets), 'The asset lines added up', 'warn')
  const liabs = ['payables', 'debt', 'other_liabilities'].map(g)
  if (liabs.filter((x) => x !== null).length >= 2) test('Total liabilities', g('total_liabilities'), sum(...liabs), 'The liability lines added up', 'warn')
  if (g('total_assets') !== null && g('total_liabilities') !== null && g('equity') !== null) test('Balance sheet', g('total_assets'), (g('total_liabilities') ?? 0) + (g('equity') ?? 0), 'Liabilities plus equity')
  const cfs = CF.map(g)
  if (cfs.every((x) => x !== null) && g('operating_cf') !== null && g('net_income') !== null && Math.abs(g('net_income')!) > 0 && Math.sign(g('operating_cf')!) !== Math.sign(g('net_income')!) && Math.abs(g('operating_cf')! - g('net_income')!) > Math.abs(g('net_income')!) * 3)
    out.push({ period_end: r.period_end, period_type: r.period_type, what: 'Operating cash flow', detail: 'Operating cash flow and net income point in opposite directions by a wide margin; check the sign of the cash flow lines.', diff: 0, severity: 'warn' })
  for (const k of ['cogs', ...OPEX, 'opex_total']) { const v = g(k); if (v !== null && v < 0) out.push({ period_end: r.period_end, period_type: r.period_type, what: 'Sign of a cost', detail: k.replace('opex_', '').replace('_', ' ') + ' is negative; costs are usually entered as positive numbers.', diff: v, severity: 'warn' }) }
  return out
}
// Across periods: cash that jumps without the cash flow to explain it.
export function checkRows(rows: FinRow[]): Check[] {
  const out = rows.flatMap(checkRow)
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!, b = rows[i]!
    if (a.period_type !== b.period_type) continue
    const c0 = num(a.lines.cash), c1 = num(b.lines.cash), flows = CF.map((k) => num(b.lines[k]))
    if (c0 === null || c1 === null || flows.some((x) => x === null)) continue
    const net = flows.reduce<number>((s, x) => s + (x ?? 0), 0), d = (c1 - c0) - net
    if (Math.abs(d) > Math.max(2, Math.abs(c1) * 0.02)) out.push({ period_end: b.period_end, period_type: b.period_type, what: 'Cash movement', detail: 'Cash moved by ' + Math.round(c1 - c0).toLocaleString('en-US') + ' but the cash flow lines add up to ' + Math.round(net).toLocaleString('en-US') + '.', diff: d, severity: 'warn' })
  }
  return out
}
