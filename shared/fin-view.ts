// Financial views shared by the page and the server: roll months up into quarters or years (or any range), the
// figures worked out from the lines, and arithmetic checks that flag where a sheet's own totals do not add up.
export type Lines = Record<string, number | null | undefined>
export interface FinRow { period_end: string; period_type: string; currency: string; lines: Lines; kpis: Record<string, number>; derived: Record<string, number | null>; months?: number; from?: string }

const PL = ['revenue', 'cogs', 'gross_profit', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other', 'opex_total', 'ebitda', 'depreciation', 'interest', 'other_income', 'tax', 'net_income']
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
  for (const k of [...PL, ...CF, 'cash', 'receivables', 'investments', 'long_term_investments', 'other_assets', 'total_assets', 'payables', 'debt', 'other_liabilities', 'total_liabilities', 'equity']) out[k] = g(k)
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
  // Depreciation, interest expense and tax are costs (kept positive); other income (interest and dividends earned, gains)
  // keeps its sign and is added back.
  if (g('ebitda') !== null && (g('depreciation') !== null || g('interest') !== null || g('tax') !== null || g('other_income') !== null)) test('Net income', g('net_income'), (g('ebitda') ?? 0) - Math.abs(g('depreciation') ?? 0) - Math.abs(g('interest') ?? 0) - Math.abs(g('tax') ?? 0) + (g('other_income') ?? 0), 'EBITDA less depreciation, interest expense and tax, plus other income', 'warn')
  const assets = ['cash', 'receivables', 'investments', 'long_term_investments', 'other_assets'].map(g)
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
const mi = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1
const mlabel = (k: number) => new Date(Date.UTC(Math.floor(k / 12), k % 12, 15)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
// Across periods: months with no figures between others (a tab or a year not brought in), cash missing for recent
// months, and cash that jumps without the cash flow to explain it.
export function checkRows(rows: FinRow[]): Check[] {
  const out = rows.flatMap(checkRow)
  const ms = rows.filter((r) => r.period_type === 'month').sort((a, b) => a.period_end.localeCompare(b.period_end))
  for (let i = 1; i < ms.length; i++) {
    const a = mi(ms[i - 1]!.period_end), b = mi(ms[i]!.period_end)
    if (b - a > 1) out.push({ period_end: ms[i]!.period_end, period_type: 'month', what: 'Missing months', detail: 'No figures for ' + (b - a - 1 === 1 ? mlabel(a + 1) : mlabel(a + 1) + ' to ' + mlabel(b - 1)) + '. Growth, year-on-year and runway skip these months; add them or check the linked sheet brought in every tab.', diff: 0, severity: 'warn' })
  }
  if (ms.length >= 2) {
    const withCash = ms.filter((r) => num(r.lines.cash) !== null)
    const lastCash = withCash[withCash.length - 1], last = ms[ms.length - 1]!
    if (lastCash && mi(last.period_end) - mi(lastCash.period_end) >= 2) out.push({ period_end: last.period_end, period_type: 'month', what: 'Cash missing', detail: 'The last cash balance is for ' + mlabel(mi(lastCash.period_end)) + ', ' + (mi(last.period_end) - mi(lastCash.period_end)) + ' months before your latest figures. Runway is not worked out from it; add the balance sheet for recent months.', diff: 0, severity: 'warn' })
  }
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

// "Cash and marketable securities": when the company chose to count treasury bills and similar (the investments line,
// short-term holdings only; stakes and long-term holdings are long_term_investments and never count) as cash, cash shown and runway use both; the bank balance alone is kept as bank_cash.
export function withSecurities<T extends Record<string, number | null | undefined>>(d: T, on: boolean): T {
  if (!on || typeof d.investments !== 'number') return d
  const cash = (typeof d.cash === 'number' ? d.cash : 0) + (d.investments as number)
  const burn = typeof d.burn === 'number' ? d.burn : null
  return { ...d, bank_cash: d.cash ?? null, cash, runway: burn ? Math.round((cash / burn) * 10) / 10 : d.runway ?? null }
}

// Burn and runway, checked over the last three months (monthly figures):
//   operating cash flow (plus investing, when given) · cash flow worked out from the balance sheet (net loss with
//   depreciation added back, adjusted for the change in receivables, payables, other assets and liabilities) · fall in
//   cash not funded by financing · net loss with depreciation added back. The figure used is the first one there is, in
//   that order. When cash burn and the loss differ because of working capital (bills left unpaid, customers paying
//   later), it names the biggest driver instead of calling the figures wrong.
export interface BurnMethod { key: 'cash_flow' | 'balance_sheet' | 'net_loss' | 'cash_change'; label: string; value: number | null }
export interface BurnDriver { key: string; label: string; change: number; effect: number }
export interface BurnReview { burn: number | null; basis: string; runway: number | null; cash: number | null; cash_at: string | null; months: number; methods: BurnMethod[]; status: 'ok' | 'check' | 'none'; issues: string[]; notes: string[]; drivers: BurnDriver[]; loss_burn: number | null; runway_at_loss: number | null; profitable: boolean }
// Balance sheet lines that move cash without going through profit: assets that rise use cash, liabilities that rise keep it.
const WC: { key: string; side: 1 | -1; up: string; down: string }[] = [
  { key: 'payables', side: 1, up: 'payables rose {x} (supplier bills not yet paid)', down: 'payables fell {x} (old supplier bills paid)' },
  { key: 'other_liabilities', side: 1, up: 'other liabilities rose {x} (such as customer prepayments, accrued costs or taxes owed)', down: 'other liabilities fell {x} (such as customer prepayments used up, accrued costs or taxes paid)' },
  { key: 'receivables', side: -1, up: 'receivables rose {x} (customers paying later)', down: 'receivables fell {x} (customers paid money they owed)' },
  { key: 'other_assets', side: -1, up: 'other assets rose {x} (such as prepayments, loans given or equipment)', down: 'other assets fell {x} (such as prepayments used or loans repaid)' },
  { key: 'investments', side: -1, up: 'short-term investments rose {x}', down: 'short-term investments fell {x}' },
  { key: 'long_term_investments', side: -1, up: 'long-term investments rose {x}', down: 'long-term investments fell {x}' }]
export function burnReview(raw: FinRow[], cashOverride?: (d: Record<string, number | null>) => number | null): BurnReview {
  const rows = raw.filter((r) => r.period_type === 'month').slice().sort((a, b) => (a.period_end < b.period_end ? -1 : 1))
  const d = rows.map((r) => r.derived ?? deriveLines(r.lines, 1))
  const cashOf = (x: Record<string, number | null>) => (cashOverride ? cashOverride(x) : x.cash)
  const last3 = d.slice(-3), n = last3.length
  const avg = (f: (x: Record<string, number | null>) => number | null) => { const v = last3.map(f).filter((x): x is number => x !== null); return v.length === n && n ? v.reduce((a, b) => a + b, 0) / n : null }
  const cf = avg((x) => (x.operating_cf === null ? null : -((x.operating_cf ?? 0) + (x.investing_cf ?? 0))))
  const nl = avg((x) => (x.net_income === null ? null : -(x.net_income + (x.depreciation ?? 0))))
  const fmt = (v: number) => Math.round(v).toLocaleString('en-US')
  // Cash change: from the month before the window to its last month, net of money raised (financing).
  let cc: number | null = null
  const startIdx = d.length - n - 1
  const a0 = startIdx >= 0 ? d[startIdx]! : null, a1 = d[d.length - 1] ?? null
  if (n && a0 && a1) { const a = cashOf(a0), b = cashOf(a1); if (a !== null && b !== null) { const fin = last3.reduce((s, x) => s + (x.financing_cf ?? 0), 0); cc = (a - b + fin) / n } }
  // Cash flow from the balance sheet: the loss adjusted for working capital (also explains a cash flow statement).
  // Short-term investments already counted as cash (bank_cash present) are not a movement.
  const drivers: BurnDriver[] = []
  let bs: number | null = null
  if (n && a0 && a1 && nl !== null) {
    let wc = 0, seen = 0
    for (const w of WC) {
      if (w.key === 'investments' && a1.bank_cash !== undefined) continue
      const x0 = a0[w.key], x1 = a1[w.key]
      if (typeof x0 !== 'number' || typeof x1 !== 'number') continue
      seen++
      const ch = x1 - x0, eff = w.side * ch
      wc += eff
      if (Math.abs(ch) >= 1) drivers.push({ key: w.key, label: (ch > 0 ? w.up : w.down).replace('{x}', fmt(Math.abs(ch))), change: ch, effect: eff })
    }
    if (seen >= 2) bs = nl - wc / n
    drivers.sort((p, q) => Math.abs(q.effect) - Math.abs(p.effect))
  }
  const methods: BurnMethod[] = [{ key: 'cash_flow', label: 'Operating (and investing) cash flow', value: cf }, { key: 'balance_sheet', label: 'Cash flow worked out from the balance sheet', value: bs }, { key: 'cash_change', label: 'Fall in cash, excluding money raised', value: cc }, { key: 'net_loss', label: 'Net loss, depreciation added back', value: nl }]
  const close = (p: number, q: number) => Math.abs(p - q) <= Math.max(2000, Math.abs(q) * 0.1)
  // Working capital explains the gap between cash burn and the loss when the balance sheet figure matches the fall in cash.
  const explained = bs !== null && nl !== null && (cc === null || close(bs, cc)) && !close(bs, nl)
  let pick = methods.find((m) => m.value !== null) ?? null
  // "No burn" from the balance sheet is not used when the other figures contradict it: cash fell (net of money raised)
  // or the company made a loss, and the balance sheet does not explain why. Burn then comes from the fall in cash, else
  // the loss, so a loss-making company is never shown as cash-flow positive.
  if (pick?.key === 'balance_sheet' && (pick.value ?? 0) <= 0 && !explained) {
    const alt = (cc ?? 0) > 1000 ? methods.find((m) => m.key === 'cash_change') : (nl ?? 0) > 1000 ? methods.find((m) => m.key === 'net_loss') : null
    if (alt) pick = alt
  }
  let cashAt: string | null = null, cash: number | null = null
  for (let i = d.length - 1; i >= 0; i--) { const v = cashOf(d[i]!); if (v !== null) { cash = v; cashAt = rows[i]!.period_end; break } }
  const burn = pick ? Math.max(0, pick.value!) : null
  const issues: string[] = [], notes: string[] = []
  if (explained && drivers.length) {
    const top = drivers.filter((x) => Math.sign(x.effect) === Math.sign(nl! - bs!) && Math.abs(x.effect) >= Math.abs((nl! - bs!) * n) * 0.25).slice(0, 2)
    const lower = bs! < nl!
    notes.push('Cash burn (about ' + fmt(burn ?? Math.max(0, bs!)) + ' a month) is ' + (lower ? 'lower' : 'higher') + ' than the loss (' + fmt(nl!) + ' a month)' + (top.length ? ' mainly because ' + top.map((x) => x.label).join(' and ') + ' over the last ' + n + ' months.' : ' because of changes in working capital.') +
      (lower && top.some((x) => x.key === 'payables' || x.key === 'other_liabilities') && top[0]!.change > 0 ? ' When those bills are paid, burn moves back towards the loss.' : ''))
  }
  const vals = methods.filter((m) => m.value !== null && !(explained && m.key === 'net_loss')) as { key: string; label: string; value: number }[]
  if (vals.length >= 2) {
    const hi = Math.max(...vals.map((v) => v.value)), lo = Math.min(...vals.map((v) => v.value)), scale = Math.max(Math.abs(hi), Math.abs(lo), 1)
    if ((hi - lo) / scale > 0.3 && hi - lo > 1000) issues.push('The burn figures disagree: ' + vals.map((v) => v.label.toLowerCase() + ' ' + fmt(v.value)).join(', ') + ' a month.' + (bs !== null && cc !== null && !close(bs, cc) ? ' The balance sheet does not explain the change in cash: check for a raise, a loan, or a balance sheet line missing from the figures.' : ' Check non-cash items, unpaid bills, customer prepayments, loan repayments or a raise missing from the figures.'))
  }
  if (cc !== null && cc < 0 && (nl ?? 0) > 0 && !last3.some((x) => (x.financing_cf ?? 0) !== 0) && !explained) issues.push('Cash went up while the figures show a loss. If money was raised or a loan drawn, add it as financing cash flow so burn is not understated.')
  if ((nl ?? 0) <= 0 && nl !== null && (cc ?? 0) > 0 && (cc ?? 0) > 1000 && !explained) issues.push('Profitable on paper but cash is falling about ' + fmt(cc!) + ' a month. Check receivables, stock, capital spending or loan repayments.')
  const single = last3.length && pick?.key !== 'balance_sheet' ? (() => { const x = last3[last3.length - 1]!; return x.operating_cf !== null ? -((x.operating_cf ?? 0) + (x.investing_cf ?? 0)) : x.net_income !== null ? -x.net_income : null })() : null
  if (single !== null && burn && burn > 0 && Math.abs(single - burn) / burn > 0.5) notes.push('The latest month (' + fmt(single) + ') is far from the 3-month average (' + fmt(burn) + '); runway uses the average.')
  if (cashAt && rows.length && cashAt < rows[rows.length - 1]!.period_end) issues.push(mi(rows[rows.length - 1]!.period_end) - mi(cashAt) >= 2 ? 'Cash was last given for ' + mlabel(mi(cashAt)) + ', so runway is not worked out. Add the balance sheet for recent months.' : 'Cash was last given at ' + cashAt + '; runway is from that balance.')
  if (n < 3) issues.push('Fewer than three months of figures: burn is a rough guide.')
  // A cash balance well before the latest month says nothing about runway today.
  const stale = !!cashAt && rows.length > 0 && mi(rows[rows.length - 1]!.period_end) - mi(cashAt) >= 2
  const runCash = stale ? null : cash
  const runway = runCash !== null && burn ? Math.round((runCash / burn) * 10) / 10 : null
  const lossBurn = nl === null ? null : Math.max(0, nl)
  const runwayAtLoss = runCash !== null && lossBurn && explained ? Math.round((runCash / lossBurn) * 10) / 10 : null
  return { burn: burn === null ? null : Math.round(burn), basis: pick?.label ?? '', runway, cash, cash_at: cashAt, months: n, methods, status: !pick ? 'none' : issues.length ? 'check' : 'ok', issues, notes, drivers: drivers.slice(0, 4), loss_burn: lossBurn === null ? null : Math.round(lossBurn), runway_at_loss: runwayAtLoss, profitable: burn === 0 }
}

// A cash flow statement worked out from the P&L and the balance sheet (indirect method), for periods that have none,
// when the company asked for it. Each period is compared with the one before it (same period type, back to back):
//   operating = net income + depreciation + change in working capital (receivables, payables, other liabilities and
//               the other assets that are not investments), plus whatever else moved cash (so it ties to the cash line)
//   investing = buying long-term and short-term investments, and other assets that are property, equipment,
//               intangibles, loans or notes given (from the company's own categories), with depreciation added back
//   financing = change in debt, plus money raised or returned (share capital, or the change in equity not explained
//               by the result when share capital is not itemised)
// Periods that already have any cash flow line are left alone. Generated periods are marked cf_generated.
const INVESTING_CAT = /(property|plant|equipment|ppe|furniture|vehicle|computer|hardware|intangible|software develop|capitali[sz]ed|development cost|licen[cs]e|certification|goodwill|loan|notes? receivable|lending|investment|deposit for|construction)/i
const monthsOf = (t: string) => (t === 'year' ? 12 : t === 'quarter' ? 3 : 1)
const ym = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))
export function fillCashFlow<T extends { period_end: string; period_type: string; lines: Lines; detail?: Record<string, number> }>(rows: T[]): (T & { cf_generated?: boolean })[] {
  const out = rows.map((r) => ({ ...r })) as (T & { cf_generated?: boolean })[]
  const order = out.map((r, i) => i).sort((a, b) => (out[a]!.period_type + out[a]!.period_end < out[b]!.period_type + out[b]!.period_end ? -1 : 1))
  for (let j = 1; j < order.length; j++) {
    const prev = out[order[j - 1]!]!, cur = out[order[j]!]!
    if (prev.period_type !== cur.period_type || ym(cur.period_end) - ym(prev.period_end) !== monthsOf(cur.period_type)) continue
    if (CF.some((k) => num(cur.lines[k]) !== null)) continue
    const g = (r: T, k: string) => num(r.lines[k])
    const ni = g(cur, 'net_income'), c0 = g(prev, 'cash'), c1 = g(cur, 'cash')
    if (ni === null || c0 === null || c1 === null) continue
    const d = (k: string) => { const a = g(prev, k), b = g(cur, k); return a !== null && b !== null ? b - a : 0 }
    // Other assets split by the company's categories: investments, property, loans given are investing; the rest is
    // working capital (prepayments, deposits, other current assets).
    const invOf = (r: T) => Object.entries(r.detail ?? {}).filter(([k]) => k.startsWith('other_assets|') && INVESTING_CAT.test(k.slice(13))).reduce((s, [, v]) => s + (num(v) ?? 0), 0)
    const hasCats = Object.keys(cur.detail ?? {}).some((k) => k.startsWith('other_assets|')) && Object.keys(prev.detail ?? {}).some((k) => k.startsWith('other_assets|'))
    const dOA = d('other_assets'), dOAinv = hasCats ? invOf(cur) - invOf(prev) : dOA, dOAwc = dOA - dOAinv
    const dep = Math.abs(g(cur, 'depreciation') ?? 0)
    // Depreciation is added back in operating; it is also what property and equipment lost, so when those assets are in
    // the figures, spending on them is their change plus depreciation (investing).
    const fixed = hasCats ? invOf(cur) !== 0 || invOf(prev) !== 0 : g(cur, 'other_assets') !== null
    let operating = ni + dep - d('receivables') - dOAwc + d('payables') + d('other_liabilities')
    const investing = -(d('investments') + d('long_term_investments') + dOAinv + (fixed ? dep : 0))
    const eq0 = g(prev, 'equity'), eq1 = g(cur, 'equity')
    // Money raised or returned: the change in share capital (paid-in capital, share premium, treasury stock) when the
    // company keeps those as categories; otherwise the change in equity not explained by the result.
    const CAPITAL = /(paid[- ]?in|share capital|capital stock|common stock|ordinary shares|preferred|share premium|additional paid|treasury|buy ?back|contribution)/i
    const capOf = (r: T) => Object.entries(r.detail ?? {}).filter(([k]) => k.startsWith('equity|') && CAPITAL.test(k.slice(7))).reduce((s, [, v]) => s + (num(v) ?? 0), 0)
    const capCats = Object.keys(cur.detail ?? {}).some((k) => k.startsWith('equity|') && CAPITAL.test(k.slice(7)))
    const financing = d('debt') + (capCats ? capOf(cur) - capOf(prev) : eq0 !== null && eq1 !== null ? eq1 - eq0 - ni : 0)
    // Whatever else moved cash (lines not in the figures, rounding) is kept in operating so the statement ties to cash.
    operating += (c1 - c0) - (operating + investing + financing)
    const r2 = (v: number) => Math.round(v * 100) / 100
    cur.lines = { ...cur.lines, operating_cf: r2(operating), investing_cf: r2(investing), financing_cf: r2(financing) }
    cur.cf_generated = true
  }
  return out
}
