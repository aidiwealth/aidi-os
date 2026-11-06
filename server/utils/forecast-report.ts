// The forecast for a report or an export: the forecast a company uses (its main one, else the newest), run for the base,
// best and worst cases. For a group, each company's forecast is converted to the reporting currency (the plan rate the
// team set, else the book rate) and added together month by month.
import { run, COST_LINES, type Assumptions, type Month, type Result } from '~/shared/forecast'
import { shortAmount } from '~/shared/compact'
import type { MSection, MRow, Tone } from '~/server/utils/mgmt-report'
export interface ForecastPack { name: string; company: string; currency: string; start: string; months: number; a: Assumptions | null; base: Result; best: Result; worst: Result; companies: number }
const NUM: (keyof Month)[] = ['revenue', 'cogs', 'gross_profit', 'payroll', 'opex', 'ebitda', 'tax', 'net_income', 'items', 'funding', 'cash_flow', 'cash', 'customers', 'headcount', 'arr', 'burn']
function scale(r: Result, k: number): Result {
  if (k === 1) return r
  const months = r.months.map((m) => { const o = { ...m, costs: Object.fromEntries(Object.entries(m.costs).map(([a, v]) => [a, v * k])) } as Month
    for (const f of NUM) if (typeof m[f] === 'number' && f !== 'customers' && f !== 'headcount') (o as unknown as Record<string, number>)[f] = (m[f] as number) * k
    return o })
  return { months, summary: r.summary }
}
// Months added up across companies; a company whose forecast has ended keeps its last cash.
function combine(rs: Result[], opening: number): Result {
  const all = [...new Set(rs.flatMap((r) => r.months.map((m) => m.month)))].sort()
  const months: Month[] = all.map((mo) => {
    const o = { month: mo, parts: {}, costs: {}, gross_margin: null } as unknown as Month
    for (const f of NUM) (o as unknown as Record<string, number>)[f] = 0
    for (const r of rs) {
      const m = r.months.find((x) => x.month === mo)
      if (!m) { const prev = [...r.months].reverse().find((x) => x.month < mo); if (prev) o.cash += prev.cash; continue }
      for (const f of NUM) (o as unknown as Record<string, number>)[f] += (m[f] as number) ?? 0
      for (const [k, v] of Object.entries(m.costs)) o.costs[k] = (o.costs[k] ?? 0) + v
    }
    o.gross_margin = o.revenue ? Math.round((o.gross_profit / o.revenue) * 1000) / 10 : null
    return o
  })
  const zero = months.find((x) => x.cash < 0), be = months.find((x) => x.net_income >= 0 && x.revenue > 0), last = months[months.length - 1]
  const min = months.reduce((m, x) => (x.cash < m.cash ? x : m), months[0] ?? ({ cash: 0, month: '' } as Month))
  const burn = months.slice(0, 3).reduce((s, x) => s + (x.burn ?? 0), 0) / Math.max(1, Math.min(3, months.length))
  return { months, summary: { cash_end: last?.cash ?? opening, zero_cash: zero?.month ?? null, runway: zero ? months.indexOf(zero) : burn > 0 ? Math.round((opening / burn) * 10) / 10 : null, break_even: be?.month ?? null,
    revenue_total: months.reduce((s, x) => s + x.revenue, 0), net_total: months.reduce((s, x) => s + x.net_income, 0), funding_total: months.reduce((s, x) => s + x.funding, 0), arr_end: last?.arr ?? 0, min_cash: min?.cash ?? 0, min_cash_month: min?.month ?? '' } } as Result
}
// subject: 'group' or 'entity:<id>' (as Financials uses); id: one saved forecast (the Forecast page's export).
export async function forecastPack(o: { subject?: string; id?: string; currency?: string }): Promise<ForecastPack | null> {
  const org = (await currentOrg())!
  const base = (org.settings.currency as string) || 'USD'
  type F = { id: string; entity_id: string | null; name: string; is_main: boolean; assumptions: Assumptions }
  if (o.id) {
    const f = (await db().query<F & { ename: string | null }>('SELECT f.id, f.entity_id, f.name, f.is_main, f.assumptions, e.name AS ename FROM financials.forecasts f LEFT JOIN core.entities e ON e.id = f.entity_id WHERE f.id = $1', [o.id])).rows[0]
    if (!f) return null
    return pack(f.name, f.ename ?? org.name, f.assumptions.currency || base, [{ a: f.assumptions, k: 1 }], f.assumptions)
  }
  const ents = await custEntities()
  const ids = o.subject?.startsWith('entity:') ? [o.subject.slice(7)] : o.subject === 'group' && ents.length > 1 ? ents.map((e) => e.id) : [ents.find((e) => e.main)?.id ?? (await companyEntityId())].filter(Boolean) as string[]
  const fs = (await db().query<F>('SELECT id, entity_id, name, is_main, assumptions FROM financials.forecasts WHERE entity_id = ANY($1::uuid[]) ORDER BY is_main DESC, updated_at DESC', [ids])).rows
  const use = ids.map((id) => fs.find((f) => f.entity_id === id)).filter((x): x is F => !!x)
  if (!use.length) return null
  if (use.length === 1) { const f = use[0]!; return pack(f.name, ents.find((e) => e.id === f.entity_id)?.name ?? org.name, f.assumptions.currency || base, [{ a: f.assumptions, k: 1 }], f.assumptions) }
  // A group: each company's forecast in the reporting currency.
  const to = o.currency || (org.settings.reporting_currency as string) || base, plan = ((org.settings.forecast_rates ?? {}) as Record<string, number>), book = await rateBook(), now = new Date().toISOString().slice(0, 7)
  const parts = use.map((f) => { const cur = f.assumptions.currency || base; const per = cur === to ? 1 : plan[cur] && plan[cur] > 0 ? plan[cur] : (() => { const c = book.convert(cur, to, now); return c?.rate ? 1 / c.rate : null })(); return per ? { a: f.assumptions, k: 1 / per } : null }).filter((x): x is { a: Assumptions; k: number } => !!x)
  if (!parts.length) return null
  return pack('Group forecast (each company\'s main forecast)', String(org.settings.group_name ?? '').trim() || org.name, to, parts, null)
}
function pack(name: string, company: string, currency: string, parts: { a: Assumptions; k: number }[], a: Assumptions | null): ForecastPack {
  const go = (s: 'base' | 'best' | 'worst') => (parts.length === 1 ? scale(run(parts[0]!.a, s), parts[0]!.k) : combine(parts.map((p) => scale(run(p.a, s), p.k)), parts.reduce((t, p) => t + p.a.opening.cash * p.k, 0)))
  const b = go('base')
  return { name, company, currency, start: b.months[0]?.month ?? '', months: b.months.length, a, base: b, best: go('best'), worst: go('worst'), companies: parts.length }
}

// ---------- The Forecast section: figures, scenarios and what the forecast assumes ----------
// History from the actual months (oldest first): last 12 months' revenue, monthly growth over 6 months, and gross margin
// over the last 3 months, to set the forecast against.
export function forecastHistory(rows: { lines: Record<string, number | null | undefined> }[]): { ttm: number | null; cmgr: number | null; gm: number | null } {
  const rev = rows.map((r) => (typeof r.lines.revenue === 'number' ? r.lines.revenue : null))
  const l12 = rev.slice(-12).filter((x): x is number => x !== null), six = rev.slice(-7)
  const a = six[0], b = six[six.length - 1]
  const l3 = rows.slice(-3), r3 = l3.reduce((s, r) => s + (Number(r.lines.revenue) || 0), 0), c3 = l3.reduce((s, r) => s + (Number(r.lines.cogs) || 0), 0)
  return { ttm: l12.length >= 12 ? l12.reduce((s, x) => s + x, 0) : null, cmgr: a && b && a > 0 && b > 0 && six.length === 7 ? (Math.pow(b / a, 1 / 6) - 1) * 100 : null, gm: r3 > 0 ? ((r3 - c3) / r3) * 100 : null }
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ml = (m: string) => MON[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(2, 4)
// In words and boxes: the full year ("Sep 2031", not "Sep 31", which reads like a date).
const mlf = (m: string) => MON[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4)
export function forecastSection(fc: ForecastPack, o: { audience?: 'board' | 'executive' | 'investor'; hist?: { ttm: number | null; cmgr: number | null; gm: number | null } | null }): MSection {
  const exec = o.audience === 'executive', board = (o.audience ?? 'board') === 'board'
  const cy = fc.currency, sym = cy === 'USD' ? '$' : cy === 'GBP' ? '£' : cy === 'EUR' ? '€' : cy + ' '
  const money = (v: number | null) => (v === null ? '–' : (v < 0 ? '(' : '') + Math.round(Math.abs(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''))
  const short = (v: number | null) => (v === null ? '–' : shortAmount(v, sym))
  const pc = (v: number | null, d = 1) => (v === null ? '–' : (v > 0 ? '+' : '') + v.toFixed(d) + '%')
  const RW = (n: number) => (n >= 24 ? 'over 24 months' : n >= 12 ? '12 to 24 months' : n >= 6 ? '6 to 12 months' : 'under 6 months')
  const RWs = (n: number) => (n >= 24 ? '24+ months' : n >= 12 ? '12–24 months' : n >= 6 ? '6–12 months' : '< 6 months')
  const ms = fc.base.months, s = fc.base.summary, first12 = ms.slice(0, 12)
  const rev12 = first12.reduce((t, m) => t + m.revenue, 0), ebitda12 = first12.reduce((t, m) => t + m.ebitda, 0)
  // Short enough for a box or a table cell.
  const runsOut = (r: typeof fc.base) => { const z = r.summary.zero_cash; if (!z) return 'No'; const i = r.months.findIndex((m) => m.month === z); return exec ? RWs(i) : mlf(z) }
  // Columns: quarters when the forecast is longer than 6 months (up to 8), else months; then the total.
  const byQ = ms.length > 6
  const cols: { label: string; ms: typeof ms }[] = []
  for (const m of ms) { const key = byQ ? m.month.slice(0, 4) + '-Q' + Math.ceil(Number(m.month.slice(5, 7)) / 3) : m.month; const lab = byQ ? 'Q' + key.slice(-1) + " '" + key.slice(2, 4) : ml(m.month); const c = cols.find((x) => x.label === lab); if (c) c.ms.push(m); else cols.push({ label: lab, ms: [m] }) }
  // The next 12 months by quarter, then a column for the year and, when the forecast runs longer, one for the rest.
  const shown = cols.filter((c) => !byQ || c.ms.every((m) => ms.indexOf(m) < 12)).slice(0, byQ ? 4 : 6), shownMs = shown.flatMap((c) => c.ms), restMs: typeof ms = []
  // After the first year: one column per 12 months ("To Sep 28"), in a table of its own.
  const years: { label: string; ms: typeof ms }[] = []
  for (let k = shownMs.length; k < ms.length; k += 12) { const xs = ms.slice(k, k + 12); years.push({ label: (xs.length < 12 ? xs.length + ' months to ' : 'To ') + ml(xs[xs.length - 1]!.month), ms: xs }) }
  const sum = (xs: typeof ms, f: (m: (typeof ms)[number]) => number) => xs.reduce((t, m) => t + f(m), 0)
  const line = (label: string, f: (m: (typeof ms)[number]) => number, kind?: MRow['kind']): MRow => ({ label, kind, cells: [...shown.map((c) => money(sum(c.ms, f))), money(sum(shownMs, f)), ...(restMs.length ? [money(sum(restMs, f))] : [])] })
  const fmtE = (v: number, n: boolean) => (n ? Math.round(v).toLocaleString('en-US') : money(v))
  const end = (label: string, f: (m: (typeof ms)[number]) => number, kind?: MRow['kind'], n = false): MRow => ({ label, kind, cells: [...shown.map((c) => fmtE(f(c.ms[c.ms.length - 1]!), n)), fmtE(f(shownMs[shownMs.length - 1]!), n), ...(restMs.length ? [fmtE(f(restMs[restMs.length - 1]!), n)] : [])] })
  const gmRow: MRow = { label: 'Gross margin', cells: [...shown.map((c) => { const r = sum(c.ms, (m) => m.revenue); return r ? ((sum(c.ms, (m) => m.gross_profit) / r) * 100).toFixed(1) + '%' : '–' }), ...[shownMs, ...(restMs.length ? [restMs] : [])].map((xs) => { const r = sum(xs, (m) => m.revenue); return r ? ((sum(xs, (m) => m.gross_profit) / r) * 100).toFixed(1) + '%' : '–' })] }
  // The cost lines the companies use (Sales & marketing, Product & engineering, …), where any has a figure.
  const costKeys = [...COST_LINES, ...[...new Set(ms.flatMap((m) => Object.keys(m.costs ?? {})))].filter((k) => !COST_LINES.some((c) => c.key === k)).map((key) => ({ key, label: 'Other operating costs' }))].filter((c) => ms.some((m) => Math.abs(m.costs?.[c.key] ?? 0) > 0.5))
  const rows: MRow[] = [line('Revenue', (m) => m.revenue, 'total'), line('Cost of revenue', (m) => m.cogs), line('Gross profit', (m) => m.gross_profit, 'total'), gmRow,
    ...(exec ? [] : [line('Payroll', (m) => m.payroll), ...costKeys.map((c) => line(c.label, (m) => m.costs[c.key] ?? 0))]), line('Operating costs' + (exec ? '' : ' (incl. payroll)'), (m) => m.opex), line('EBITDA', (m) => m.ebitda, 'total'), line('Net income', (m) => m.net_income, 'total'),
    ...(ms.some((m) => m.items) ? [line('One-off items', (m) => m.items)] : []), ...(ms.some((m) => m.funding) ? [line('Funding', (m) => m.funding)] : []),
    end('Cash at the end', (m) => m.cash, 'total'), ...(ms.some((m) => m.customers) ? [end('Customers', (m) => m.customers ?? 0, undefined, true)] : []), ...(!exec && ms.some((m) => m.headcount) ? [end('Headcount', (m) => m.headcount ?? 0, undefined, true)] : [])]
  const yearRows = (ys: typeof years): MRow[] => {
    const L = (label: string, f: (m: (typeof ms)[number]) => number, kind?: MRow['kind']): MRow => ({ label, kind, cells: ys.map((y) => money(sum(y.ms, f))) })
    const E = (label: string, f: (m: (typeof ms)[number]) => number, kind?: MRow['kind'], n = false): MRow => ({ label, kind, cells: ys.map((y) => fmtE(f(y.ms[y.ms.length - 1]!), n)) })
    return [L('Revenue', (m) => m.revenue, 'total'), L('Gross profit', (m) => m.gross_profit, 'total'), { label: 'Gross margin', cells: ys.map((y) => { const r = sum(y.ms, (m) => m.revenue); return r ? ((sum(y.ms, (m) => m.gross_profit) / r) * 100).toFixed(1) + '%' : '–' }) },
      L('Operating costs', (m) => m.opex), L('EBITDA', (m) => m.ebitda, 'total'), L('Net income', (m) => m.net_income, 'total'), ...(ys.some((y) => y.ms.some((m) => m.funding)) ? [L('Funding', (m) => m.funding)] : []),
      E('Cash at the end', (m) => m.cash, 'total'), ...(ms.some((m) => m.customers) ? [E('Customers', (m) => m.customers ?? 0, undefined, true)] : [])]
  }
  const sc = (lab: string, r: typeof fc.base): MRow => ({ label: lab, cells: [short(r.summary.revenue_total), short(r.summary.net_total), short(r.summary.cash_end), short(r.summary.min_cash), runsOut(r)] })
  // What the forecast says, and what it assumes, set against the actual figures.
  const b: { text: string; tone?: Tone }[] = []
  const h = o.hist
  if (h?.ttm && first12.length === 12) { const g = (rev12 / h.ttm - 1) * 100; b.push({ text: 'Revenue over the next 12 months: ' + short(rev12) + ', ' + pc(g) + ' on the last 12 months (' + short(h.ttm) + ').', tone: g >= 0 ? 'good' : 'watch' }) }
  else b.push({ text: 'Revenue over the next ' + Math.min(12, ms.length) + ' months: ' + short(rev12) + '; EBITDA ' + short(ebitda12) + '.' })
  if (ms.length >= 12 && ms[0]!.revenue > 0 && ms[11]!.revenue > 0) {
    const fg = (Math.pow(ms[11]!.revenue / ms[0]!.revenue, 1 / 11) - 1) * 100
    const hi = h?.cmgr !== null && h?.cmgr !== undefined && fg > h.cmgr + 2 && fg > h.cmgr * 1.5
    b.push({ text: 'The forecast grows revenue about ' + pc(fg) + ' a month' + (h?.cmgr !== null && h?.cmgr !== undefined ? ', against ' + pc(h.cmgr) + ' a month over the last 6 months' + (hi ? ': faster than the company has grown, so it depends on what changes.' : '.') : '.'), tone: hi ? 'watch' : undefined })
  }
  const fgm = (() => { const x = ms.slice(0, 3), r = sum(x, (m) => m.revenue); return r ? (sum(x, (m) => m.gross_profit) / r) * 100 : null })()
  if (fgm !== null && h?.gm !== null && h?.gm !== undefined && Math.abs(fgm - h.gm) >= 3) b.push({ text: 'Gross margin starts at ' + fgm.toFixed(1) + '% in the forecast against ' + h.gm.toFixed(1) + '% in the last 3 months.', tone: 'watch' })
  b.push(s.break_even ? { text: 'Profitable from ' + mlf(s.break_even) + ' in the base case.', tone: 'good' } : { text: 'Not profitable within the ' + ms.length + ' months of the forecast in the base case.', tone: 'watch' })
  if (s.zero_cash) b.push({ text: 'Cash runs out ' + (exec ? 'in ' + RW(ms.findIndex((m) => m.month === s.zero_cash)) : 'in ' + mlf(s.zero_cash)) + ' in the base case unless more money is raised.', tone: 'risk' })
  else b.push({ text: 'Cash stays positive throughout; the low point is ' + short(s.min_cash) + (s.min_cash_month ? ' in ' + mlf(s.min_cash_month) : '') + '.', tone: 'good' })
  if (s.funding_total) { const fm = ms.find((m) => m.funding > 0); b.push({ text: 'The plan includes ' + short(s.funding_total) + ' of funding' + (fm ? ', the first in ' + mlf(fm.month) : '') + '.' }) }
  const w = fc.worst.summary
  b.push({ text: 'Worst case: revenue ' + short(w.revenue_total) + ', cash at the end ' + short(w.cash_end) + (w.zero_cash ? ', and cash runs out ' + (exec ? 'in ' + RW(fc.worst.months.findIndex((m) => m.month === w.zero_cash)) : 'in ' + mlf(w.zero_cash)) : '') + '.', tone: w.zero_cash ? 'risk' : undefined })
  if (board && fc.a?.hires?.length) b.push({ text: fc.a.hires.length + ' planned hire' + (fc.a.hires.length === 1 ? '' : 's') + ', adding ' + short(fc.a.hires.reduce((t, x) => t + x.monthly_cost, 0)) + ' a month once all have started.' })
  // Long forecasts: every third month labelled, so the labels do not run into each other.
  const lab = ms.map((m, i) => (ms.length <= 12 || i % 3 === 0 || i === ms.length - 1 ? ml(m.month) : ''))
  return {
    key: 'forecast', title: 'Forecast', raw: true,
    intro: '"' + fc.name + '"' + (fc.companies > 1 ? ' for ' + fc.companies + ' companies' : '') + ': ' + fc.months + ' months from ' + mlf(fc.start) + ', in ' + cy + '. Base case, with the best and worst cases below.',
    tiles: [{ label: 'Revenue, next 12 months', value: short(rev12) }, { label: 'EBITDA, next 12 months', value: short(ebitda12), tone: ebitda12 >= 0 ? 'good' : 'risk' },
      { label: 'Cash at the end', value: short(s.cash_end), sub: mlf(ms[ms.length - 1]!.month), tone: s.cash_end < 0 ? 'risk' : undefined }, { label: 'Profitable from', value: s.break_even ? mlf(s.break_even) : 'Not yet', sub: s.break_even ? 'base case' : 'within the forecast' },
      { label: 'Lowest cash', value: short(s.min_cash), sub: s.min_cash_month ? mlf(s.min_cash_month) : undefined, tone: s.min_cash < 0 ? 'risk' : undefined }, { label: 'Cash runs out', value: runsOut(fc.base), sub: s.zero_cash ? 'base case' : 'not within the forecast', tone: s.zero_cash ? 'risk' : 'good' }],
    tables: [{ title: 'Forecast by ' + (byQ ? 'quarter' : 'month') + ' (base case)', head: ['', ...shown.map((c) => c.label), shownMs.length === 12 ? 'Total' : 'Total (' + shownMs.length + ' months)'], rows },
      ...(years.length ? [{ title: 'Later years (base case)', head: ['', ...years.slice(0, 5).map((y) => y.label)], rows: yearRows(years.slice(0, 5)) }] : []),
      { title: 'Scenarios (whole forecast)', head: ['', 'Revenue', 'Net income', 'Cash at the end', 'Lowest cash', 'Cash runs out'], rows: [sc('Base', fc.base), sc('Best', fc.best), sc('Worst', fc.worst)] }],
    charts: [{ title: 'Cash at month end (base case)', labels: lab, values: ms.map((m) => Math.round(m.cash)) }, { title: 'Revenue by month (base case)', labels: lab, values: ms.map((m) => Math.round(m.revenue)) }],
    bullets: b.map((x) => ({ ...x, raw: true })),
  }
}
