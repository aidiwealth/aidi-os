import { shortAmount } from '~/shared/compact'
// The monthly management report: how the business did in one month, for the executive team. The founder picks which
// sections go in; every figure is worked out here from the company's own statements (nothing estimated), with the
// analysis' key points, what to raise, and the founder's own comments. Made as a PDF or an Excel file.
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { burnReview, checkRow, deriveLines, rollUp, type FinRow } from '~/shared/fin-view'
import { modelOf } from '~/shared/business-models'
import type { ReportProfile } from './fin-report'

export const MR_SECTIONS: { key: string; title: string; desc: string; on: boolean }[] = [
  { key: 'intro', title: 'About the company', desc: 'Who the company is, what it does, where it operates and who leads it', on: true },
  { key: 'summary', title: 'At a glance', desc: 'Headline, six key numbers, a health check and the four key points', on: true },
  { key: 'scorecard', title: 'Key numbers', desc: 'This month against last month, the same month last year and the year to date', on: true },
  { key: 'growth', title: 'Revenue and growth', desc: 'Month-on-month, quarter and year-on-year growth, with 12-month charts', on: true },
  { key: 'pl', title: 'Profit and loss', desc: 'Income statement for the month and year to date, with your own categories', on: true },
  { key: 'costs', title: 'Where the money goes', desc: 'For every 100 of sales, each cost line and the biggest changes', on: true },
  { key: 'cash', title: 'Cash, burn and runway', desc: 'Cash, monthly burn, months of runway and what moved cash', on: true },
  { key: 'balance', title: 'Balance sheet', desc: 'What the company owns and owes, against last month and the start of the year', on: false },
  { key: 'cashflow', title: 'Cash flow', desc: 'Operating, investing and financing cash flow for the month and year to date', on: false },
  { key: 'kpis', title: 'Business metrics', desc: 'Your KPIs (customers, volumes, headcount…) against earlier months', on: true },
  { key: 'retention', title: 'Revenue retention', desc: 'Net and gross revenue retention, customers lost, where revenue came and went, retention by group', on: false },
  { key: 'customers', title: 'Customers', desc: 'Paying customers, recurring revenue, average customer, concentration, sectors and top customers', on: false },
  { key: 'banking', title: 'Banking and spend', desc: 'Money in and out from the bank, spend by category against budget, the biggest payments and recurring costs', on: true },
  { key: 'stage', title: 'Stage and readiness', desc: 'Funding and operating stage, health, runway, and equity and debt readiness (indicative only)', on: true },
  { key: 'checks', title: 'Data checks', desc: 'Totals in the figures that do not add up', on: false },
  { key: 'actions', title: 'For the executive team', desc: 'What to raise with the executive team, the CFO and the board', on: true },
  { key: 'comments', title: 'Management comments', desc: 'Your own commentary and priorities for next month', on: true }]

export interface MTile { label: string; value: string; sub?: string; tone?: Tone }
export interface MRow { label: string; cells: string[]; kind?: 'total' | 'sub' | 'head' | 'line'; tones?: (Tone | '')[] }
export interface MTable { title?: string; head: string[]; rows: MRow[]; note?: string }
export interface MChart { title: string; labels: string[]; values: (number | null)[]; pct?: boolean }
// A breakdown (parts of a whole): drawn as a pie, or as bars when the founder prefers.
export interface MPie { title: string; note?: string; slices: { label: string; value: number }[] }
export type ChartKind = 'area' | 'line' | 'bar'
export interface MSection { key: string; title: string; intro?: string; facts?: [string, string][]; pies?: MPie[]; tiles?: MTile[]; tables?: MTable[]; charts?: MChart[]; bullets?: { text: string; tone?: Tone }[]; text?: { head: string; body: string }[] }
export interface MReport { kind?: string; company: string; month: string; label: string; currency: string; sections: MSection[]; generated: boolean; business: string | null; chart: ChartKind; pies: boolean }
type Tone = 'good' | 'watch' | 'risk'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
// The report's period: a month, or (quarterly and annual reports) months rolled into quarters or years. Set while one
// report is built (building is synchronous).
let PER: 'month' | 'quarter' | 'year' = 'month'
const ML = (d: string, short = false) => PER === 'year' ? (short ? "'" + d.slice(2, 4) : d.slice(0, 4)) : PER === 'quarter' ? 'Q' + Math.ceil(Number(d.slice(5, 7)) / 3) + ' ' + (short ? "'" + d.slice(2, 4) : d.slice(0, 4))
  : new Date(d.slice(0, 7) + '-15T00:00:00Z').toLocaleDateString('en-GB', { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric', timeZone: 'UTC' })
const pctCh = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100)
const sumOf = (rs: { d: Record<string, number | null> }[], k: string) => { const v = rs.map((r) => num(r.d[k])).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null }

// Up to six slices, the rest grouped as "Other".
function pieOf(title: string, xs: { label: string; value: number }[], note?: string): MPie {
  const s2 = xs.filter((x) => x.value > 0).sort((p, q) => q.value - p.value)
  const top = s2.slice(0, 6), rest = s2.slice(6).reduce((a, x) => a + x.value, 0)
  return { title, note, slices: rest > 0 ? [...top, { label: 'Other', value: rest }] : top }
}
// Quarterly and annual reports: the months up to the chosen one rolled into quarters or years (flows added, balances
// at the period's end); burn and runway still come from the monthly figures; the wording follows the period.
export function buildMgmtReport(raw: (FinRow & { detail?: Record<string, number>; cf_generated?: boolean })[], o: Parameters<typeof buildMonthly>[1] & { period?: 'month' | 'quarter' | 'year' }): MReport {
  if (!o.period || o.period === 'month') return buildMonthly(raw, o)
  const months = raw.filter((r) => r.period_type === 'month' && r.period_end.slice(0, 7) <= o.month.slice(0, 7)).sort((a, b) => a.period_end.localeCompare(b.period_end))
  if (!months.length) throw new Error('No figures for that period.')
  const rolled = rollUp(months as FinRow[], o.period).map((r) => ({ ...r, period_type: 'month' }))
  const last = months[months.length - 1]!, sel = rolled[rolled.length - 1]!
  PER = o.period
  try {
    const r = buildMonthly(rolled as never, { ...o, month: sel.period_end, reviewRows: months as FinRow[] })
    const u = o.period
    const us = u + 's', U = u[0]!.toUpperCase() + u.slice(1), before = u === 'year' ? 'the year before' : 'the same quarter last year'
    const swap: [RegExp, string][] = [[/Month-on-month/g, U + '-on-' + u], [/On the same month last year/g, 'On ' + before], [/the same month last year/g, before], [/same month last year/g, before], [/[Oo]n last month/g, 'On last ' + u],
      [/Last 3 months vs the 3 before/g, 'Last 3 ' + us + ' vs the 3 before'], [/last 3 months/g, 'last 3 ' + us], [/3 months ago/g, '3 ' + us + ' ago'], [/on the quarter before/g, 'on the 3 ' + us + ' before'], [/on the quarter/g, 'on the last 3 ' + us],
      [/Last month/g, 'Last ' + u], [/last month/g, 'last ' + u], [/This month/g, 'This ' + u], [/this month/g, 'this ' + u], [/in the month/g, 'in the ' + u], [/for the month/g, 'for the ' + u], [/the month/g, 'the ' + u],
      [/next month/g, 'next ' + u], [/by month/g, 'by ' + u], [/each month/g, 'each ' + u], [/earlier months/g, 'earlier ' + us], [/^Month$/g, U]]
    const fix = (x: unknown): unknown => (typeof x === 'string' ? swap.reduce((t, [a, b]) => t.replace(a, b), x) : Array.isArray(x) ? x.map(fix) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 'value' || k === 'labels' ? v : fix(v)])) : x)
    const out = { ...r, kind: (u === 'year' ? 'Annual' : 'Quarterly') + ' management report', sections: fix(r.sections) as MSection[] }
    const sm = Number(sel.period_end.slice(0, 4)) === Number(last.period_end.slice(0, 4)) && (o.period === 'year' ? last.period_end.slice(5, 7) !== '12' : Number(last.period_end.slice(5, 7)) % 3 !== 0)
    out.label = ML(sel.period_end) + (sm ? ' (to ' + new Date(last.period_end.slice(0, 7) + '-15T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) + ')' : '')
    return out
  } finally { PER = 'month' }
}
function buildMonthly(raw: (FinRow & { detail?: Record<string, number>; cf_generated?: boolean })[], o: {
  company: string; month: string; sections: string[]; fyeMonth: number; model: string | null; withSecurities: boolean
  analysis: { headline: string; insights: { title: string; detail: string; tone: Tone }[]; flags: { for: string; item: string; why: string }[] } | null
  customers: Record<string, any> | null; comments: string; priorities: string
  about?: { text: string; facts: [string, string][]; leaders: [string, string][] } | null
  chart?: ChartKind; pies?: boolean; reviewRows?: FinRow[]
}): MReport {
  const rows = raw.filter((r) => r.period_type === 'month').sort((a, b) => a.period_end.localeCompare(b.period_end)).map((r) => ({ ...r, d: r.derived ?? deriveLines(r.lines, 1) }))
  const i = rows.findIndex((r) => r.period_end.slice(0, 7) === o.month.slice(0, 7))
  if (i < 0) throw new Error('No figures for that month.')
  const cur = rows[i]!, prev = i > 0 ? rows[i - 1]! : null, upTo = rows.slice(0, i + 1)
  const cy = cur.currency
  const yoy = rows.find((r) => r.period_end.slice(0, 7) === String(Number(cur.period_end.slice(0, 4)) - 1) + cur.period_end.slice(4, 7)) ?? null
  // Year to date in the company's fiscal year (and the same months a year earlier).
  const m = Number(cur.period_end.slice(5, 7)), y = Number(cur.period_end.slice(0, 4))
  const fyStartY = m > o.fyeMonth ? y : y - 1
  const fyStart = new Date(Date.UTC(fyStartY, o.fyeMonth, 1)).toISOString().slice(0, 7)
  const ytd = upTo.filter((r) => r.period_end.slice(0, 7) >= fyStart)
  const lyStart = String(Number(fyStart.slice(0, 4)) - 1) + fyStart.slice(4), lyEnd = String(y - 1) + cur.period_end.slice(4, 7)
  const ytdLy = rows.filter((r) => r.period_end.slice(0, 7) >= lyStart && r.period_end.slice(0, 7) <= lyEnd)
  const openRow = rows.filter((r) => r.period_end.slice(0, 7) < fyStart).pop() ?? null
  const g = (r: typeof cur | null, k: string) => (r ? num(r.d[k]) : null)
  const sym = cy === 'USD' ? '$' : cy === 'GBP' ? '£' : cy === 'EUR' ? '€' : cy + ' '
  const money = (v: number | null) => (v === null ? '–' : (v < 0 ? '(' : '') + Math.round(Math.abs(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''))
  const short = (v: number | null) => (v === null ? '–' : shortAmount(v, sym))
  const pct = (v: number | null, d = 1) => (v === null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d).replace(/\.0$/, '') + '%')
  const pts = (v: number | null) => (v === null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace(/\.0$/, '') + ' pts')
  const COST = new Set(['cogs', 'opex_total', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other', 'depreciation', 'interest', 'tax'])
  const toneCh = (k: string, ch: number | null): Tone | '' => (ch === null || Math.abs(ch) < 0.5 ? '' : (COST.has(k) ? ch < 0 : ch > 0) ? 'good' : 'risk')
  const review = burnReview((o.reviewRows ?? upTo) as unknown as FinRow[])
  const bm = modelOf(o.model)
  const rev = g(cur, 'revenue'), revP = g(prev, 'revenue'), gm = g(cur, 'gross_margin')
  const sections: MSection[] = []
  const want = (k: string) => o.sections.includes(k)
  const LBL: Record<string, string> = { revenue: 'Revenue', cogs: 'Cost of sales', gross_profit: 'Gross profit', gross_margin: 'Gross margin', opex_payroll: 'Payroll', opex_marketing: 'Sales and marketing', opex_rnd: 'Research and development', opex_ga: 'General and administrative', opex_other: 'Other operating costs', opex_total: 'Total running costs', ebitda: 'EBITDA', depreciation: 'Depreciation', interest: 'Interest expense', other_income: 'Other income', tax: 'Tax', net_income: 'Net income (loss)', cash: 'Cash', burn: 'Monthly burn (3-month average)', runway: 'Runway (months)', receivables: 'Receivables', investments: 'Short-term investments', long_term_investments: 'Long-term investments', other_assets: 'Other assets', total_assets: 'Total assets', payables: 'Payables', debt: 'Debt', other_liabilities: 'Other liabilities', total_liabilities: 'Total liabilities', equity: 'Equity', operating_cf: 'Operating cash flow', investing_cf: 'Investing cash flow', financing_cf: 'Financing cash flow' }
  const last12 = upTo.slice(-12)

  // Health check: four areas, each good / watch / risk with one line.
  const rev3 = sumOf(upTo.slice(-3), 'revenue'), rev3p = sumOf(upTo.slice(-6, -3), 'revenue')
  const g3 = upTo.length >= 6 ? pctCh(rev3, rev3p) : null, mom = pctCh(rev, revP), yo = pctCh(rev, g(yoy, 'revenue'))
  const ox3 = sumOf(upTo.slice(-3), 'opex_total'), ox3p = sumOf(upTo.slice(-6, -3), 'opex_total'), oxg = upTo.length >= 6 ? pctCh(ox3, ox3p) : null
  const runLow = review.runway_at_loss ?? review.runway
  const health: { area: string; tone: Tone; line: string }[] = []
  const gBase = g3 ?? mom
  if (gBase !== null) health.push({ area: 'Growth', tone: gBase >= 5 ? 'good' : gBase >= -2 ? 'watch' : 'risk', line: g3 !== null ? 'Revenue ' + pct(g3) + ' over the last 3 months against the 3 before' + (yo !== null ? '; ' + pct(yo) + ' on the same month last year' : '') + '.' : 'Revenue ' + pct(mom) + ' on last month.' })
  if (gm !== null) { const r = bm?.gm; health.push({ area: 'Margins', tone: r ? (gm < r[0] ? 'risk' : gm < (r[0] + r[1]) / 2 ? 'watch' : 'good') : gm < 20 ? 'risk' : gm < 50 ? 'watch' : 'good', line: 'Gross margin ' + gm.toFixed(1).replace(/\.0$/, '') + '%' + (r ? ' (usual for ' + bm!.short + ': ' + r[0] + '–' + r[1] + '%)' : '') + '.' }) }
  if (oxg !== null && g3 !== null) health.push({ area: 'Costs', tone: oxg - g3 > 10 ? 'risk' : oxg - g3 > 0 ? 'watch' : 'good', line: 'Running costs ' + pct(oxg) + ' against revenue ' + pct(g3) + ' over the last 3 months.' })
  if (review.status !== 'none') health.push({ area: 'Cash', tone: review.profitable ? 'good' : runLow === null ? 'watch' : runLow < 9 ? 'risk' : runLow < 15 ? 'watch' : 'good', line: review.profitable ? 'Cash-flow positive.' : review.runway !== null ? review.runway + ' months of runway at ' + short(review.burn) + ' a month' + (review.runway_at_loss ? ' (' + review.runway_at_loss + ' at the loss rate)' : '') + '.' : 'Add a cash balance to see runway.' })

  if (want('intro') && o.about && (o.about.text.trim() || o.about.facts.length)) {
    const team = ['Headcount', 'Employees', 'Team size', 'FTE'].map((k) => num(cur.kpis?.[k])).find((v) => v !== null) ?? null
    const facts: [string, string][] = [...o.about.facts]
    if (team !== null) facts.push(['Team', Math.round(team).toLocaleString('en-US') + ' people'])
    if (bm) facts.push(['Business type', bm.label])
    facts.push(['Revenue, last 12 months', short(sumOf(last12, 'revenue')) + (last12.length < 12 ? ' (' + last12.length + ' months)' : '')])
    facts.push(...o.about.leaders)
    sections.push({ key: 'intro', title: 'About the company', text: o.about.text.trim() ? [{ head: '', body: o.about.text.trim() }] : undefined, facts })
  }

  if (want('summary')) {
    const ni = g(cur, 'net_income')
    const headline = o.analysis?.headline || [mom !== null ? 'Revenue ' + (mom >= 0 ? 'up ' : 'down ') + Math.abs(mom).toFixed(1).replace(/\.0$/, '') + '% on last month' : '', ni !== null ? (ni >= 0 ? 'a profit of ' : 'a loss of ') + short(Math.abs(ni)) : '', review.runway !== null ? review.runway + ' months of runway' : ''].filter(Boolean).join('; ').replace(/^./, (c) => c.toUpperCase()) + '.'
    sections.push({ key: 'summary', title: 'At a glance', intro: headline,
      tiles: [
        { label: 'Revenue', value: short(rev), sub: mom !== null ? pct(mom) + ' on last month' : undefined, tone: mom === null ? undefined : mom >= 0 ? 'good' : 'risk' },
        { label: 'Gross margin', value: gm === null ? '–' : gm.toFixed(1).replace(/\.0$/, '') + '%', sub: prev && g(prev, 'gross_margin') !== null && gm !== null ? pts(gm - g(prev, 'gross_margin')!) + ' on last month' : undefined },
        { label: ni !== null && ni < 0 ? 'Net loss' : 'Net income', value: short(ni === null ? null : Math.abs(ni)), sub: rev && ni !== null ? Math.abs((ni / rev) * 100).toFixed(1).replace(/\.0$/, '') + '% of revenue' : undefined, tone: ni === null ? undefined : ni >= 0 ? 'good' : 'risk' },
        { label: o.withSecurities ? 'Cash and securities' : 'Cash', value: short(g(cur, 'cash')), sub: prev && g(prev, 'cash') !== null && g(cur, 'cash') !== null ? (g(cur, 'cash')! - g(prev, 'cash')! >= 0 ? 'up ' : 'down ') + short(Math.abs(g(cur, 'cash')! - g(prev, 'cash')!)) + ' in the month' : undefined },
        { label: 'Monthly burn', value: review.profitable ? 'None' : short(review.burn), sub: '3-month average' },
        { label: 'Runway', value: review.profitable ? 'Cash-flow positive' : review.runway !== null ? review.runway + ' months' : '–', sub: review.runway_at_loss ? review.runway_at_loss + ' at the loss rate' : undefined, tone: runLow === null ? undefined : runLow < 9 ? 'risk' : runLow < 15 ? 'watch' : 'good' }],
      tables: health.length ? [{ title: 'Health check', head: ['Area', 'Status', ''], rows: health.map((h) => ({ label: h.area, cells: [h.tone === 'good' ? 'Good' : h.tone === 'watch' ? 'Watch' : 'Risk', h.line], tones: [h.tone, ''] })) }] : undefined,
      bullets: (o.analysis?.insights ?? []).slice(0, 4).map((x) => ({ text: x.title + '. ' + x.detail, tone: x.tone })) })
  }

  if (want('scorecard')) {
    const keys = ['revenue', 'cogs', 'gross_profit', 'gross_margin', 'opex_total', 'ebitda', 'net_income', 'cash']
    const flows = new Set(['revenue', 'cogs', 'gross_profit', 'opex_total', 'ebitda', 'net_income'])
    const t: MTable = { head: ['', ML(cur.period_end, true), prev ? ML(prev.period_end, true) : 'Last month', 'Change', yoy ? ML(yoy.period_end, true) : 'Last year', 'Change', 'Year to date'], rows: [] }
    // Without the same month last year, those two columns are left out.
    for (const k of keys) {
      const a = g(cur, k), b = g(prev, k), c = g(yoy, k)
      if (a === null && b === null) continue
      if (k === 'gross_margin') { const yt = sumOf(ytd, 'revenue') ? ((sumOf(ytd, 'gross_profit') ?? 0) / sumOf(ytd, 'revenue')!) * 100 : null; t.rows.push({ label: LBL[k]!, cells: [a === null ? '–' : a.toFixed(1) + '%', b === null ? '–' : b.toFixed(1) + '%', a !== null && b !== null ? pts(a - b) : '–', c === null ? '–' : c.toFixed(1) + '%', a !== null && c !== null ? pts(a - c) : '–', yt === null ? '–' : yt.toFixed(1) + '%'], tones: ['', '', a !== null && b !== null ? toneCh(k, a - b) : '', '', a !== null && c !== null ? toneCh(k, a - c) : '', ''] }); continue }
      const ch1 = pctCh(a, b), ch2 = pctCh(a, c)
      t.rows.push({ label: LBL[k]!, kind: ['gross_profit', 'net_income'].includes(k) ? 'total' : 'line', cells: [money(a), money(b), pct(ch1), money(c), pct(ch2), flows.has(k) ? money(sumOf(ytd, k)) : '–'], tones: ['', '', toneCh(k, ch1), '', toneCh(k, ch2), ''] })
    }
    t.rows.push({ label: LBL.burn!, cells: [review.profitable ? 'None' : money(review.burn), '', '', '', '', ''] }, { label: LBL.runway!, cells: [review.runway === null ? '–' : String(review.runway), '', '', '', '', ''] })
    if (!yoy) { t.head.splice(4, 2); for (const rw of t.rows) { rw.cells.splice(3, 2); rw.tones?.splice(3, 2) } }
    sections.push({ key: 'scorecard', title: 'Key numbers', intro: 'Amounts in ' + cy + '. Year to date from ' + ML(fyStart + '-01') + '.', tables: [t] })
  }

  if (want('growth')) {
    const six = upTo.slice(-7), r0 = g(six[0] ?? null, 'revenue'), r6 = g(six[six.length - 1] ?? null, 'revenue')
    const cmgr = six.length === 7 && r0 && r6 && r0 > 0 && r6 > 0 ? (Math.pow(r6 / r0, 1 / 6) - 1) * 100 : null
    const ytdG = pctCh(sumOf(ytd, 'revenue'), ytdLy.length === ytd.length ? sumOf(ytdLy, 'revenue') : null)
    sections.push({ key: 'growth', title: 'Revenue and growth',
      tiles: [{ label: 'On last month', value: pct(mom), tone: mom === null ? undefined : mom >= 0 ? 'good' : 'risk' }, { label: 'Last 3 months vs the 3 before', value: pct(g3), tone: g3 === null ? undefined : g3 >= 0 ? 'good' : 'risk' }, { label: 'On the same month last year', value: pct(yo), tone: yo === null ? undefined : yo >= 0 ? 'good' : 'risk' },
        { label: 'Average monthly growth (6 months)', value: pct(cmgr) }, { label: 'Year to date vs last year', value: pct(ytdG) }, { label: 'Revenue, last 12 months', value: short(sumOf(last12, 'revenue')) }],
      charts: [{ title: 'Revenue by month', labels: last12.map((r) => ML(r.period_end, true)), values: last12.map((r) => g(r, 'revenue')) }, { title: 'Gross profit by month', labels: last12.map((r) => ML(r.period_end, true)), values: last12.map((r) => g(r, 'gross_profit')) }] })
  }

  // Lines with the company's own categories under them (detail "<line>|<name>").
  const withCats = (keys: string[], cols: ((k: string) => number | null)[], detailCols: ((k: string) => number | null)[]) => {
    const out: MRow[] = []
    for (const k of keys) {
      const vals = cols.map((f) => f(k)); if (vals.every((v) => v === null)) continue
      out.push({ label: LBL[k] ?? k, kind: ['gross_profit', 'ebitda', 'net_income', 'opex_total', 'total_assets', 'total_liabilities', 'equity'].includes(k) ? 'total' : 'line', cells: vals.map(money) })
      const names = [...new Set([cur, prev].flatMap((r) => Object.keys(r?.detail ?? {})).filter((x) => x.startsWith(k + '|')))]
      for (const n of names) out.push({ label: n.slice(k.length + 1), kind: 'sub', cells: detailCols.map((f) => money(f(n))) })
    }
    return out
  }
  const det = (r: typeof cur | null, n: string) => (r ? num(r.detail?.[n]) : null)
  const detSum = (rs: typeof rows, n: string) => { const v = rs.map((r) => num(r.detail?.[n])).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null }
  const PLK = ['revenue', 'cogs', 'gross_profit', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other', 'opex_total', 'ebitda', 'depreciation', 'interest', 'other_income', 'tax', 'net_income']
  if (want('pl')) {
    sections.push({ key: 'pl', title: 'Profit and loss', intro: 'Costs are shown as positive amounts; a loss is shown in brackets.', tables: [{ head: ['', ML(cur.period_end, true), prev ? ML(prev.period_end, true) : 'Last month', 'Year to date', ytdLy.length ? 'Same period last year' : ''].filter((h, n) => n < 4 || ytdLy.length),
      rows: withCats(PLK, [(k) => g(cur, k), (k) => g(prev, k), (k) => sumOf(ytd, k), ...(ytdLy.length ? [(k: string) => sumOf(ytdLy, k)] : [])], [(n) => det(cur, n), (n) => det(prev, n), (n) => detSum(ytd, n), ...(ytdLy.length ? [(n: string) => detSum(ytdLy, n)] : [])]) }] })
  }

  if (want('costs') && rev && rev > 0) {
    const c = g(cur, 'cogs') ?? 0, ox = g(cur, 'opex_total') ?? 0, left = rev - c - ox
    const h = (v: number) => sym.trim() + Math.round(Math.abs((v / rev) * 100))
    const lines = ['cogs', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other']
    const items: { label: string; a: number | null; b: number | null }[] = []
    for (const k of lines) {
      const names = Object.keys(cur.detail ?? {}).filter((x) => x.startsWith(k + '|'))
      if (names.length && k !== 'cogs') for (const n of names) items.push({ label: n.slice(k.length + 1), a: det(cur, n), b: det(prev, n) })
      else if (g(cur, k) !== null || g(prev, k) !== null) items.push({ label: LBL[k]!, a: g(cur, k), b: g(prev, k) })
    }
    const movers = items.filter((x) => x.a !== null && x.b !== null && x.a !== x.b).sort((p, q) => Math.abs(q.a! - q.b!) - Math.abs(p.a! - p.b!)).slice(0, 3)
    sections.push({ key: 'costs', title: 'Where the money goes',
      intro: 'You spend ' + h(c + ox) + ' for every ' + sym.trim() + '100 you sell: ' + h(c) + ' on cost of sales and ' + h(ox) + ' on running costs, so you ' + (left < 0 ? 'lose ' + h(-left) : 'keep ' + h(left)) + '.',
      tiles: [{ label: 'Cost of sales', value: h(c), sub: 'of every ' + sym.trim() + '100' }, { label: 'Running costs', value: h(ox), sub: 'of every ' + sym.trim() + '100' }, { label: left < 0 ? 'Loss' : 'Kept', value: h(left), sub: 'of every ' + sym.trim() + '100', tone: left < 0 ? 'risk' : 'good' }],
      tables: [{ head: ['', ML(cur.period_end, true), prev ? ML(prev.period_end, true) : 'Last month', 'Change', '% of revenue'], rows: items.map((x) => ({ label: x.label, cells: [money(x.a), money(x.b), pct(pctCh(x.a, x.b)), x.a === null ? '–' : ((x.a / rev) * 100).toFixed(1) + '%'], tones: ['', '', toneCh('cogs', pctCh(x.a, x.b)), ''] })) }],
      pies: [pieOf('Where the money went in ' + ML(cur.period_end), items.filter((x) => (x.a ?? 0) > 0).map((x) => ({ label: x.label, value: x.a! })), 'Cost of sales and each running cost, as a share of all spending')],
      bullets: movers.map((x) => ({ text: x.label + (x.a! > x.b! ? ' up ' : ' down ') + short(Math.abs(x.a! - x.b!)) + ' on last month (' + pct(pctCh(x.a, x.b)) + ').', tone: x.a! > x.b! ? 'watch' : 'good' as Tone })) })
  }

  if (want('cash')) {
    const c0 = g(prev, 'cash'), c1 = g(cur, 'cash')
    sections.push({ key: 'cash', title: 'Cash, burn and runway', intro: review.basis ? 'Burn is the 3-month average from ' + review.basis.toLowerCase() + '. Runway is cash divided by burn.' : undefined,
      tiles: [{ label: o.withSecurities ? 'Cash and securities' : 'Cash', value: short(c1) }, { label: 'Change in the month', value: c0 !== null && c1 !== null ? short(c1 - c0) : '–', tone: c0 !== null && c1 !== null ? (c1 >= c0 ? 'good' : 'watch') : undefined }, { label: 'Monthly burn', value: review.profitable ? 'None' : short(review.burn) },
        { label: 'Runway', value: review.profitable ? 'Cash-flow positive' : review.runway !== null ? review.runway + ' months' : '–', tone: runLow === null ? undefined : runLow < 9 ? 'risk' : runLow < 15 ? 'watch' : 'good' }, ...(review.runway_at_loss ? [{ label: 'Runway at the loss rate', value: review.runway_at_loss + ' months', sub: 'once unpaid bills are settled' }] : []), ...(review.loss_burn ? [{ label: 'Loss before depreciation', value: short(review.loss_burn), sub: 'a month, 3-month average' }] : [])],
      charts: [{ title: 'Cash at the end of each month', labels: last12.map((r) => ML(r.period_end, true)), values: last12.map((r) => g(r, 'cash')) }],
      bullets: [...review.notes.map((t) => ({ text: t })), ...review.issues.map((t) => ({ text: t, tone: 'watch' as Tone }))] })
  }

  if (want('balance')) {
    const BK = ['cash', 'receivables', 'investments', 'long_term_investments', 'other_assets', 'total_assets', 'payables', 'debt', 'other_liabilities', 'total_liabilities', 'equity']
    // Cash in the balance sheet is the bank balance: with securities counted as cash, the headline cash already includes
    // the short-term investments line, which is shown on its own row here.
    const gb = (r: typeof cur | null, k: string) => (k === 'cash' && r && o.withSecurities && r.d.bank_cash !== undefined ? num(r.d.bank_cash) : g(r, k))
    const bsPart = (keys: string[]) => keys.flatMap((k) => { const names = Object.keys(cur.detail ?? {}).filter((x) => x.startsWith(k + '|')); return names.length ? names.map((n) => ({ label: n.slice(k.length + 1), value: det(cur, n) ?? 0 })) : [{ label: LBL[k] ?? k, value: gb(cur, k) ?? 0 }] }).filter((x) => x.value > 0)
    const balPies = [pieOf('What the company owns', bsPart(['cash', 'receivables', 'investments', 'long_term_investments', 'other_assets']), 'Assets at ' + ML(cur.period_end)), pieOf('What it owes', bsPart(['payables', 'debt', 'other_liabilities']), 'Liabilities at ' + ML(cur.period_end))].filter((x) => x.slices.length >= 2)
    sections.push({ key: 'balance', title: 'Balance sheet', pies: balPies, tables: [{ head: ['', ML(cur.period_end, true), prev ? ML(prev.period_end, true) : 'Last month', 'Change', openRow ? 'Start of year' : ''].filter((h, n) => n < 4 || openRow),
      rows: withCats(BK, [(k) => gb(cur, k), (k) => gb(prev, k), (k) => (gb(cur, k) !== null && gb(prev, k) !== null ? gb(cur, k)! - gb(prev, k)! : null), ...(openRow ? [(k: string) => gb(openRow, k)] : [])], [(n) => det(cur, n), (n) => det(prev, n), (n) => (det(cur, n) !== null && det(prev, n) !== null ? det(cur, n)! - det(prev, n)! : null), ...(openRow ? [(n: string) => det(openRow, n)] : [])]) }] })
  }

  if (want('cashflow')) {
    const CK = ['operating_cf', 'investing_cf', 'financing_cf']
    const net = (r: typeof cur | null) => (r && CK.some((k) => g(r, k) !== null) ? CK.reduce((s, k) => s + (g(r, k) ?? 0), 0) : null)
    const rowsCf: MRow[] = CK.filter((k) => g(cur, k) !== null || g(prev, k) !== null).map((k) => ({ label: LBL[k]!, cells: [money(g(cur, k)), money(g(prev, k)), money(sumOf(ytd, k))] }))
    if (rowsCf.length) rowsCf.push({ label: 'Net change in cash', kind: 'total', cells: [money(net(cur)), money(net(prev)), money(ytd.some((r) => net(r) !== null) ? ytd.reduce((s, r) => s + (net(r) ?? 0), 0) : null)] }, { label: 'Cash at the end', cells: [money(g(cur, 'cash')), money(g(prev, 'cash')), money(g(cur, 'cash'))] })
    sections.push({ key: 'cashflow', title: 'Cash flow', intro: cur.cf_generated ? 'Worked out from the profit and loss and the balance sheet, as you asked.' : undefined, tables: rowsCf.length ? [{ head: ['', ML(cur.period_end, true), prev ? ML(prev.period_end, true) : 'Last month', 'Year to date'], rows: rowsCf }] : undefined, text: rowsCf.length ? undefined : [{ head: '', body: 'No cash flow in the figures for this month.' }] })
  }

  if (want('kpis')) {
    const names = Object.keys(cur.kpis ?? {})
    const ago = (n: number) => upTo[i - n] ?? null
    const kv = (r: typeof cur | null, k: string) => (r ? num(r.kpis?.[k]) : null)
    sections.push({ key: 'kpis', title: 'Business metrics', tables: names.length ? [{ head: ['', ML(cur.period_end, true), 'Last month', 'Change', '3 months ago', '12 months ago'], rows: names.map((k) => ({ label: k, cells: [fmtK(kv(cur, k)), fmtK(kv(prev, k)), pct(pctCh(kv(cur, k), kv(prev, k))), fmtK(kv(ago(3), k)), fmtK(kv(ago(12), k))] })) }] : undefined,
      text: names.length ? undefined : [{ head: '', body: 'No KPIs for this month. Add them (customers, volumes, headcount…) with your figures or from your linked sheet.' }] })
  }

  if ((want('retention') || want('customers')) && o.customers) {
    const f = o.customers, l3 = f.last_3_months ?? {}, who = f.only ? String(f.only) + ' customers only. ' : ''
    const lbls = f.trend ? (f.trend.labels as string[]).map((m) => ML(m + '-01', true)) : []
    const P0 = (v: unknown) => (v == null ? '–' : v + '%')
    type Pts = { headline?: string; insights?: { title: string; detail: string; tone: Tone }[] } | null | undefined
    const pts = (a: Pts) => (a?.insights?.length ? { bullets: a.insights.slice(0, 4).map((x) => ({ text: x.title + '. ' + x.detail, tone: x.tone })) } : {})
    const head = (a: Pts) => (a?.headline ? ' ' + a.headline : '')
    const P = (f.points ?? {}) as { retention?: Pts; customers?: Pts }
    if (want('retention')) sections.push({ key: 'retention', title: 'Revenue retention' + (f.only ? ' · ' + f.only : ''), intro: who + 'From your customer data up to ' + ML(String(f.as_of) + '-01') + '. Revenue retention compares the same customers a year apart: net includes customers who spend more, gross does not.' + head(P.retention), ...pts(P.retention),
      tiles: [{ label: 'Net revenue retention (12 months)', value: P0(f.nrr_12m_pct), tone: f.nrr_12m_pct == null ? undefined : f.nrr_12m_pct >= 100 ? 'good' : f.nrr_12m_pct >= 90 ? 'watch' : 'risk', sub: f.nrr_12m_pct_3_months_ago == null ? undefined : P0(f.nrr_12m_pct_3_months_ago) + ' three months ago' },
        { label: 'Gross revenue retention', value: P0(f.grr_12m_pct), tone: f.grr_12m_pct == null ? undefined : f.grr_12m_pct >= 90 ? 'good' : f.grr_12m_pct >= 80 ? 'watch' : 'risk' },
        { label: 'Customers lost (12 months)', value: P0(f.logo_churn_12m_pct), sub: f.customers_a_year_ago ? 'of ' + Number(f.customers_a_year_ago).toLocaleString('en-US') + ' a year ago' : undefined },
        { label: 'Year-1 cohort retention', value: P0(f.cohort_m12_retention_pct), sub: 'average across cohorts' }],
      charts: f.trend ? [{ title: 'Net revenue retention, 12 months', labels: lbls, values: f.trend.nrr, pct: true }, { title: 'Gross revenue retention, 12 months', labels: lbls, values: f.trend.grr ?? [], pct: true }, { title: 'Customers lost, 12 months', labels: lbls, values: f.trend.churn ?? [], pct: true }] : undefined,
      pies: (() => { const sl = [['New customers', l3.new], ['Spending more', l3.expansion], ['Spending less', l3.contraction], ['Lost', l3.churned]].map(([l, v]) => ({ label: String(l), value: Math.abs(num(v) ?? 0) })); return sl.some((x) => x.value > 0) ? [pieOf('Where revenue came and went, last 3 months', sl, 'Size of each movement')] : [] })(),
      tables: [{ title: 'Revenue movement, last 3 months', head: ['', 'Amount'], rows: [['New customers', l3.new], ['Existing customers spending more', l3.expansion], ['Existing customers spending less', l3.contraction], ['Customers lost', l3.churned]].map(([l, v]) => ({ label: String(l), cells: [money(num(v))] })) },
        ...(!f.only && Array.isArray(f.groups) && f.groups.length > 1 ? [{ title: 'Retention by customer group (' + String(f.group_by) + ')', head: ['', 'Customers', 'Share', 'Net', 'Gross', 'Lost'], rows: (f.groups as { group: string; customers: number; share_pct: number | null; nrr_pct: number | null; grr_pct: number | null; logo_churn_pct: number | null }[]).map((g) => ({ label: g.group, cells: [String(g.customers), P0(g.share_pct), P0(g.nrr_pct), P0(g.grr_pct), P0(g.logo_churn_pct)] })) }] : [])] })
    if (want('customers')) sections.push({ key: 'customers', title: 'Customers' + (f.only ? ' · ' + f.only : ''), intro: who + 'From your customer data up to ' + ML(String(f.as_of) + '-01') + '.' + head(P.customers), ...pts(P.customers),
      tiles: [{ label: 'Paying customers', value: f.active == null ? '–' : Number(f.active).toLocaleString('en-US') }, { label: 'Annual recurring revenue', value: short(f.arr ?? null) }, { label: 'Average customer', value: short(f.arpa_month ?? null), sub: 'a month' },
        { label: 'Top 10 customers', value: P0(f.top10_share_pct), sub: 'of revenue' }, ...(f.ltv_to_cac != null ? [{ label: 'Lifetime value to acquisition cost', value: f.ltv_to_cac + '×', tone: (f.ltv_to_cac >= 3 ? 'good' : f.ltv_to_cac >= 1.5 ? 'watch' : 'risk') as Tone }] : [])],
      charts: f.trend ? [{ title: 'Annual recurring revenue', labels: lbls, values: f.trend.arr }, { title: 'Paying customers', labels: lbls, values: f.trend.active ?? [] }] : undefined,
      pies: [
        ...(Array.isArray(f.sectors) && f.sectors.length >= 2 ? [pieOf('Revenue by customer sector', (f.sectors as { sector: string; share_pct: number }[]).map((x) => ({ label: x.sector, value: x.share_pct })), 'Share of revenue, last 12 months')] : []),
        ...(Array.isArray(f.top) && f.top.length ? [pieOf('How concentrated revenue is', [...(f.top as { name: string; share_pct: number }[]).map((x) => ({ label: x.name, value: x.share_pct })), { label: 'All other customers', value: Math.max(0, 100 - (f.top as { share_pct: number }[]).reduce((a2: number, x) => a2 + x.share_pct, 0)) }], 'Top 5 customers against the rest, last 12 months')] : [])],
      tables: [
        ...(Array.isArray(f.sectors) && f.sectors.length ? [{ title: 'Revenue by customer sector', head: ['', 'Share', 'Customers', 'Growth', 'Revenue retention'], rows: (f.sectors as { sector: string; share_pct: number; customers: number; growth_pct: number | null; nrr_pct: number | null }[]).map((x) => ({ label: x.sector, cells: [x.share_pct + '%', String(x.customers), pct(x.growth_pct), x.nrr_pct == null ? '–' : x.nrr_pct + '%'] })) }] : []),
        ...(Array.isArray(f.top) && f.top.length ? [{ title: 'Top customers (last 12 months)', head: ['', 'Revenue', 'Share', 'Growth'], rows: (f.top as { name: string; ttm: number; share_pct: number; growth_pct: number | null }[]).map((x) => ({ label: x.name, cells: [money(x.ttm), x.share_pct + '%', pct(x.growth_pct)] })) }] : [])] })
  }

  if (want('checks')) {
    const cs = checkRow(cur)
    sections.push({ key: 'checks', title: 'Data checks', bullets: cs.length ? cs.map((c) => ({ text: c.what + ': ' + c.detail, tone: c.severity === 'error' ? 'risk' : 'watch' as Tone })) : [{ text: 'All totals in this month\'s figures add up.', tone: 'good' }] })
  }

  if (want('actions')) {
    const fl = o.analysis?.flags ?? []
    const by = ['Executive team', 'CFO', 'Board'].map((w) => ({ w, xs: fl.filter((f) => f.for === w) })).filter((x) => x.xs.length)
    // With nothing flagged, the areas the health check marks to watch or at risk are what to discuss.
    const hw = health.filter((h) => h.tone !== 'good')
    sections.push({ key: 'actions', title: 'For the executive team', text: by.length ? by.map((x) => ({ head: x.w, body: x.xs.map((f) => '• ' + f.item + ': ' + f.why).join('\n') })) : hw.length ? [{ head: 'To discuss', body: hw.map((h) => '• ' + h.area + ' (' + (h.tone === 'risk' ? 'at risk' : 'to watch') + '): ' + h.line).join('\n') }] : [{ head: '', body: 'Nothing to raise this month.' }] })
  }

  if (want('comments') && (o.comments.trim() || o.priorities.trim())) {
    sections.push({ key: 'comments', title: 'Management comments', text: [...(o.comments.trim() ? [{ head: 'Comments', body: o.comments.trim() }] : []), ...(o.priorities.trim() ? [{ head: 'Priorities for next month', body: o.priorities.trim() }] : [])] })
  }
  // Keep the founder's chosen order.
  sections.sort((a, b) => MR_SECTIONS.findIndex((s) => s.key === a.key) - MR_SECTIONS.findIndex((s) => s.key === b.key))
  return { company: o.company, month: cur.period_end, label: ML(cur.period_end), currency: cy, sections, generated: !!cur.cf_generated, business: bm?.label ?? null, chart: o.chart ?? 'area', pies: o.pies !== false }
}
const fmtK = (v: number | null) => (v === null ? '–' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100))

// ---- PDF ------------------------------------------------------------------------------------------------------
const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/−/g, '-').replace(/•/g, '-').replace(/₦/g, 'NGN ').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF\n£€]/g, '')
export async function mgmtPdf(r: MReport, logo: { data: Buffer; ext: 'png' | 'jpeg' } | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(r.company + ' ' + (r.kind ?? 'Monthly management report').toLowerCase() + ', ' + r.label); pdf.setProducer('Finvry'); pdf.setCreator(clean(r.company))
  pdf.registerFontkit(fontkit)
  const reg = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.regular, 'base64'), { subset: true }), bold = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.semibold, 'base64'), { subset: true })
  let img: PDFImage | null = null
  if (logo) img = await (logo.ext === 'png' ? pdf.embedPng(logo.data) : pdf.embedJpg(logo.data)).catch(() => null)
  const W = 612, H = 792, M = 48
  const navy = rgb(12 / 255, 26 / 255, 46 / 255), blue = rgb(29 / 255, 100 / 255, 168 / 255), light = rgb(70 / 255, 167 / 255, 220 / 255), ink = rgb(0.1, 0.1, 0.12), mut = rgb(0.42, 0.44, 0.47), rule = rgb(0.85, 0.87, 0.9), soft = rgb(0.961, 0.969, 0.984), red = rgb(0.75, 0.16, 0.16), amber = rgb(0.45, 0.45, 0.48)
  const TONE = { good: blue, watch: amber, risk: red } as const
  let page!: PDFPage, y = 0
  const newPage = () => {
    page = pdf.addPage([W, H]); y = H - M
    // The logo set in Settings, small at the top of every page, with the company name beside it.
    let nx = M
    if (img && pdf.getPageCount() > 1) { const h = 16, w = Math.min(70, (img.width / img.height) * h); page.drawImage(img, { x: M, y: y - 4, width: w, height: h }); nx = M + w + 8 }
    page.drawText(clean(r.company).toUpperCase(), { x: nx, y, size: 9, font: bold, color: navy })
    const t = 'MANAGEMENT REPORT · ' + r.label.toUpperCase(); page.drawText(clean(t), { x: W - M - bold.widthOfTextAtSize(clean(t), 8), y, size: 8, font: bold, color: mut })
    y -= 12; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rule }); y -= 20
  }
  const ensure = (h: number) => { if (y - h < M + 24) newPage() }
  const wrap = (t: string, f: PDFFont, size: number, w: number) => { const out: string[] = []; for (const para of clean(t).split('\n')) { let line = ''; for (const word of para.split(/\s+/).filter(Boolean)) { const tryL = line ? line + ' ' + word : word; if (f.widthOfTextAtSize(tryL, size) > w && line) { out.push(line); line = word } else line = tryL } out.push(line) } return out }
  const para = (t: string, o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; w?: number; gap?: number } = {}) => {
    const f = o.f ?? reg, size = o.size ?? 10, x = o.x ?? M, w = o.w ?? W - M - x
    for (const l of wrap(t, f, size, w)) { ensure(size + 4); page.drawText(l, { x, y, size, font: f, color: o.color ?? ink }); y -= size + 4 }
    y -= o.gap ?? 4
  }
  const fit = (t: string, f: PDFFont, size: number, w: number) => { let s = clean(t); while (s.length > 1 && f.widthOfTextAtSize(s, size) > w) s = s.slice(0, -2) + '…'.replace('…', '.'); return s }

  // Cover band on the first page.
  newPage()
  if (img) { const h = 40, w = Math.min(160, (img.width / img.height) * h); page.drawImage(img, { x: M, y: y - h + 10, width: w, height: h }); y -= h + 8 }
  page.drawText((r.kind ?? 'Monthly management report').toUpperCase(), { x: M, y, size: 10, font: bold, color: mut }); y -= 26
  page.drawText(clean(r.label), { x: M, y, size: 24, font: bold, color: navy }); y -= 20
  para('Prepared for the executive team. Management figures, unaudited.' + (r.business ? ' Business type: ' + r.business + '.' : ''), { color: mut, size: 9.5, gap: 14 })

  const tiles = (ts: MTile[]) => {
    const cols = 3, gap = 10, w = (W - M * 2 - gap * (cols - 1)) / cols, h = 54
    for (let k = 0; k < ts.length; k += cols) {
      ensure(h + gap)
      ts.slice(k, k + cols).forEach((t, j) => {
        const x = M + j * (w + gap)
        page.drawRectangle({ x, y: y - h, width: w, height: h, color: soft, borderColor: rule, borderWidth: 0.6 })
        page.drawText(fit(t.label.toUpperCase(), bold, 7, w - 16), { x: x + 8, y: y - 13, size: 7, font: bold, color: mut })
        page.drawText(fit(t.value, bold, 15, w - 16), { x: x + 8, y: y - 32, size: 15, font: bold, color: t.tone ? TONE[t.tone] : navy })
        if (t.sub) page.drawText(fit(t.sub, reg, 8, w - 16), { x: x + 8, y: y - 45, size: 8, font: reg, color: mut })
      })
      y -= h + gap
    }
    y -= 4
  }
  const table = (t: MTable) => {
    if (t.title) { ensure(30); page.drawText(clean(t.title), { x: M, y, size: 9.5, font: bold, color: navy }); y -= 14 }
    const n = t.head.length, labW = n > 4 ? 170 : n === 3 && t.rows.some((rw) => (rw.cells[1] ?? '').length > 20) ? 70 : 220
    const wide = n === 3 && labW === 70
    const colW = wide ? [70, W - M * 2 - labW - 70] : Array(n - 1).fill((W - M * 2 - labW) / (n - 1))
    const xs = colW.reduce<number[]>((a, w, j) => [...a, (j ? a[j - 1]! : M + labW) + w], [])
    const rowH = 15
    const drawHead = () => { ensure(rowH * 2); t.head.forEach((h2, j) => { if (!j || !h2) return; const s = fit(h2, bold, 7.5, colW[j - 1]! - 4); page.drawText(s, wide ? { x: xs[j - 1]! - colW[j - 1]! + 4, y, size: 7.5, font: bold, color: mut } : { x: xs[j - 1]! - bold.widthOfTextAtSize(s, 7.5) - 4, y, size: 7.5, font: bold, color: mut }) }); y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rule }); y -= 11 }
    drawHead()
    for (const rw of t.rows) {
      const lines = wide ? wrap(rw.cells[1] ?? '', reg, 8.5, colW[1]! - 8) : [null]
      const hh = Math.max(rowH, lines.length * 11 + 4)
      if (y - hh < M + 24) { newPage(); drawHead() }
      const f = rw.kind === 'total' ? bold : reg, size = rw.kind === 'sub' ? 8.5 : 9
      page.drawText(fit(rw.label, f, size, labW - (rw.kind === 'sub' ? 14 : 4)), { x: M + (rw.kind === 'sub' ? 12 : 0), y, size, font: f, color: rw.kind === 'sub' ? mut : ink })
      rw.cells.forEach((c, j) => {
        const tone = rw.tones?.[j]; const col = tone ? TONE[tone] : rw.kind === 'sub' ? mut : ink
        if (wide && j === 1) { lines.forEach((l, q) => page.drawText(l!, { x: xs[0]! + 4, y: y - q * 11, size: 8.5, font: reg, color: ink })); return }
        if (wide && j === 0) { page.drawText(clean(c), { x: M + labW + 4, y, size, font: bold, color: col }); return }
        const s = clean(c); page.drawText(s, { x: xs[j]! - f.widthOfTextAtSize(s, size) - 4, y, size, font: f, color: col })
      })
      y -= hh - 2
      if (rw.kind === 'total') { page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.4, color: rule }) }
    }
    if (t.note) para(t.note, { size: 8, color: mut })
    y -= 8
  }
  // Area line chart: the line over a soft fill down to zero, a dot on each month, the latest value labelled.
  const chart = (c: MChart) => {
    const h = 120, w = W - M * 2
    ensure(h + 34)
    page.drawText(clean(c.title), { x: M, y, size: 9.5, font: bold, color: navy }); y -= 12
    const vals = c.values, known = vals.filter((v): v is number => v !== null)
    if (!known.length) { para('No figures yet.', { size: 9, color: mut }); return }
    const max = Math.max(0, ...known), min = Math.min(0, ...known), span = max - min || 1
    const top = y, plotH = h - 28, left = M + 4, plotW = w - 8
    const n = Math.max(1, vals.length - 1)
    // Bars sit in the middle of equal slots; lines run edge to edge.
    const px = (k: number) => r.chart === 'bar' ? left + ((k + 0.5) / vals.length) * plotW : left + (vals.length === 1 ? plotW / 2 : (k / n) * plotW)
    const py = (v: number) => top - 6 - ((max - v) / span) * plotH // page coordinates
    const zero = py(0)
    // Light guide lines at the top, middle and zero.
    for (const gv of [max, (max + min) / 2]) page.drawLine({ start: { x: M, y: py(gv) }, end: { x: M + w, y: py(gv) }, thickness: 0.3, color: rule })
    page.drawLine({ start: { x: M, y: zero }, end: { x: M + w, y: zero }, thickness: 0.6, color: rule })
    // Runs of known values are drawn as separate areas (a gap where a month has no figure).
    const runs: number[][] = []; let run: number[] = []
    vals.forEach((v, k) => { if (v === null) { if (run.length) runs.push(run); run = [] } else run.push(k) }); if (run.length) runs.push(run)
    const neg = known.some((v) => v < 0) && !known.some((v) => v > 0)
    for (const rk of runs) {
      // drawSvgPath measures y downwards from the point given, so paths are written relative to (0, top).
      const sy = (pyv: number) => (top - pyv).toFixed(2), sx = (k: number) => px(k).toFixed(2)
      const linePath = rk.map((k, q) => (q ? 'L ' : 'M ') + sx(k) + ' ' + sy(py(vals[k]!))).join(' ')
      const area = linePath + ' L ' + sx(rk[rk.length - 1]!) + ' ' + sy(zero) + ' L ' + sx(rk[0]!) + ' ' + sy(zero) + ' Z'
      if (r.chart === 'bar') {
        // Bars from zero, the latest month darker.
        const bw = Math.min(28, (plotW / Math.max(1, vals.length)) * 0.6)
        for (const k of rk) { const v = vals[k]!, y0 = Math.min(zero, py(v)), hgt = Math.max(0.6, Math.abs(py(v) - zero)); page.drawRectangle({ x: px(k) - bw / 2, y: y0, width: bw, height: hgt, color: v < 0 ? red : k === vals.length - 1 ? navy : light }) }
        continue
      }
      if (r.chart === 'area') page.drawSvgPath(area, { x: 0, y: top, color: neg ? red : light, opacity: 0.18, borderWidth: 0 })
      if (rk.length > 1) page.drawSvgPath(linePath, { x: 0, y: top, borderColor: neg ? red : blue, borderWidth: 1.6 })
      for (const k of rk) page.drawCircle({ x: px(k), y: py(vals[k]!), size: k === vals.length - 1 ? 2.8 : 1.6, color: vals[k]! < 0 ? red : k === vals.length - 1 ? navy : blue })
    }
    vals.forEach((_, k) => { const lab = clean(c.labels[k] ?? ''); page.drawText(lab, { x: Math.min(M + w - reg.widthOfTextAtSize(lab, 6.5), Math.max(M, px(k) - reg.widthOfTextAtSize(lab, 6.5) / 2)), y: top - h + 8, size: 6.5, font: reg, color: mut }) })
    const fmtV = (v: number) => (c.pct ? v.toFixed(1) + '%' : (v < 0 ? '-' : '') + Math.round(Math.abs(v)).toLocaleString('en-US'))
    const lastK = vals.map((v, k) => (v === null ? -1 : k)).filter((k) => k >= 0).pop()!
    const lt = clean(fmtV(vals[lastK]!)); page.drawText(lt, { x: Math.min(M + w - bold.widthOfTextAtSize(lt, 7.5), px(lastK) - bold.widthOfTextAtSize(lt, 7.5) / 2), y: py(vals[lastK]!) + 6, size: 7.5, font: bold, color: navy })
    const mx = clean(fmtV(max)); if (max > 0 && Math.abs(py(max) - py(vals[lastK]!)) > 14) page.drawText(mx, { x: M + w - reg.widthOfTextAtSize(mx, 6.5), y: py(max) + 2, size: 6.5, font: reg, color: mut })
    y = top - h - 10
  }

  // Breakdowns: a donut with its legend (share and amount), or bars when the founder chose bars.
  const PIE = [rgb(12 / 255, 26 / 255, 46 / 255), rgb(29 / 255, 100 / 255, 168 / 255), rgb(70 / 255, 167 / 255, 220 / 255), rgb(138 / 255, 164 / 255, 196 / 255), rgb(185 / 255, 201 / 255, 220 / 255), rgb(91 / 255, 127 / 255, 166 / 255), rgb(223 / 255, 231 / 255, 241 / 255)]
  const pie = (p: MPie) => {
    const total = p.slices.reduce((a, x) => a + x.value, 0); if (!total) return
    const isPct = Math.abs(total - 100) < 0.6 && p.slices.every((x) => x.value <= 100)
    const amt = (v: number) => (isPct ? '' : '  ' + Math.round(v).toLocaleString('en-US'))
    const h = Math.max(120, p.slices.length * 16 + 30)
    ensure(h + 24)
    page.drawText(clean(p.title), { x: M, y, size: 9.5, font: bold, color: navy }); y -= 12
    if (p.note) { page.drawText(clean(p.note), { x: M, y, size: 8, font: reg, color: mut }); y -= 10 }
    const top = y
    if (r.pies) {
      const R = 48, cx = M + R + 4, cy = top - R - 6
      const sx = (x: number) => x.toFixed(2), sy = (yy: number) => (top - yy).toFixed(2)
      let a0 = -Math.PI / 2
      p.slices.forEach((x, k) => {
        const frac = x.value / total, a1 = a0 + frac * Math.PI * 2, col = PIE[k % PIE.length]!
        if (frac >= 0.999) page.drawCircle({ x: cx, y: cy, size: R, color: col })
        else {
          // Points on the page (y up), starting at the top and running clockwise; the path's y runs down from the top.
          const x0 = cx + R * Math.cos(a0), y0 = cy - R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy - R * Math.sin(a1)
          const path = 'M ' + sx(cx) + ' ' + sy(cy) + ' L ' + sx(x0) + ' ' + sy(y0) + ' A ' + R + ' ' + R + ' 0 ' + (frac > 0.5 ? 1 : 0) + ' 1 ' + sx(x1) + ' ' + sy(y1) + ' Z'
          page.drawSvgPath(path, { x: 0, y: top, color: col, borderColor: rgb(1, 1, 1), borderWidth: 0.8 })
        }
        a0 = a1
      })
      page.drawCircle({ x: cx, y: cy, size: R * 0.56, color: rgb(1, 1, 1) })
      let ly = top - 10
      p.slices.forEach((x, k) => {
        const lx = M + R * 2 + 30
        page.drawRectangle({ x: lx, y: ly - 1, width: 8, height: 8, color: PIE[k % PIE.length]!, borderColor: rule, borderWidth: 0.4 })
        page.drawText(fit(x.label, reg, 9, 220), { x: lx + 14, y: ly, size: 9, font: reg, color: ink })
        const t2 = clean((Math.round((x.value / total) * 1000) / 10).toString() + '%' + amt(x.value))
        page.drawText(t2, { x: W - M - bold.widthOfTextAtSize(t2, 9), y: ly, size: 9, font: bold, color: navy })
        ly -= 16
      })
      y = Math.min(cy - R - 12, ly - 4)
    } else {
      y -= 6
      const max = Math.max(...p.slices.map((x) => x.value)), barX = M + 170, barW = W - M - barX - 110
      p.slices.forEach((x) => {
        page.drawText(fit(x.label, reg, 9, 160), { x: M, y, size: 9, font: reg, color: ink })
        page.drawRectangle({ x: barX, y: y - 1, width: Math.max(1, (x.value / max) * barW), height: 8, color: blue })
        const t2 = clean((Math.round((x.value / total) * 1000) / 10).toString() + '%' + amt(x.value))
        page.drawText(t2, { x: W - M - bold.widthOfTextAtSize(t2, 9), y, size: 9, font: bold, color: navy }); y -= 15
      })
      y -= 6
    }
    y -= 8
  }

  for (const s of r.sections) {
    ensure(s.tiles?.length || s.charts?.length ? 150 : 80)
    y -= 4
    page.drawText(clean(s.title).toUpperCase(), { x: M, y, size: 11, font: bold, color: navy }); y -= 6
    page.drawLine({ start: { x: M, y }, end: { x: M + 120, y }, thickness: 1, color: navy }); y -= 16
    if (s.intro) para(s.intro, { size: s.key === 'summary' ? 12 : 9.5, f: s.key === 'summary' ? bold : reg, color: s.key === 'summary' ? ink : mut, gap: 8 })
    if (s.key === 'intro') for (const t of s.text ?? []) para(t.body, { size: 10.5, gap: 10 })
    if (s.facts?.length) {
      // Two columns of label and value.
      const colW = (W - M * 2) / 2
      for (let k = 0; k < s.facts.length; k += 2) {
        const pair = s.facts.slice(k, k + 2), lines = pair.map(([, v]) => wrap(v, reg, 9.5, colW - 120)), labs = pair.map(([l]) => wrap(l, bold, 8, 104))
        const hh = Math.max(...lines.map((l) => l.length * 13), ...labs.map((l) => l.length * 11)) + 6
        ensure(hh)
        pair.forEach(([lab], q) => { const x = M + q * colW; labs[q]!.forEach((l, z) => page.drawText(l, { x, y: y - z * 11, size: 8, font: bold, color: mut })); lines[q]!.forEach((l, z) => page.drawText(l, { x: x + 112, y: y - z * 13, size: 9.5, font: reg, color: ink })) })
        y -= hh
      }
      y -= 6
    }
    const ts = (s.tiles ?? []).filter((t) => t.value !== '–' && t.value !== '-')
    if (ts.length) tiles(ts)
    for (const t of s.tables ?? []) table(t)
    for (const c of s.charts ?? []) chart(c)
    for (const p of s.pies ?? []) pie(p)
    if (s.bullets?.length) {
      if (s.key === 'summary' || s.key === 'retention' || s.key === 'customers') { ensure(24); page.drawText(s.key === 'summary' ? 'Four key points' : 'Key points', { x: M, y, size: 9.5, font: bold, color: navy }); y -= 14 }
      for (const b of s.bullets) { ensure(16); page.drawRectangle({ x: M, y: y + 1, width: 5, height: 5, color: b.tone ? TONE[b.tone] : mut }); para(b.text, { x: M + 12, size: 9.5, gap: 3 }) }
      y -= 6
    }
    for (const t of s.key === 'intro' ? [] : s.text ?? []) { if (t.head) { ensure(24); page.drawText(clean(t.head), { x: M, y, size: 9.5, font: bold, color: navy }); y -= 14 } para(t.body, { size: 9.5, gap: 8 }) }
    y -= 10
  }
  // Footer with page numbers.
  const pages = pdf.getPages()
  pages.forEach((p, k) => { const t = clean(r.company + ' · ' + (r.kind ?? 'Monthly management report') + ' · ' + r.label + ' · Page ' + (k + 1) + ' of ' + pages.length); p.drawText(t, { x: M, y: 26, size: 7.5, font: reg, color: mut }); p.drawText('Confidential', { x: W - M - reg.widthOfTextAtSize('Confidential', 7.5), y: 26, size: 7.5, font: reg, color: mut }) })
  return pdf.save()
}

// ---- Excel ----------------------------------------------------------------------------------------------------
export async function mgmtXlsx(r: MReport, logo: { data: Buffer; ext: 'png' | 'jpeg' } | null): Promise<Buffer> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); wb.creator = r.company
  const NAVY = 'FF0C1A2E', MUT = 'FF6B7280', BLUE = 'FF1D64A8', RED = 'FFBF2929', SOFT = 'FFF5F7FB'
  const TONE = { good: BLUE, watch: MUT, risk: RED } as const
  const font = { name: 'Instrument Sans', size: 10.5 }
  const toNum = (s: string) => { const t = s.replace(/,/g, '').trim(); if (/^\(\d+(\.\d+)?\)$/.test(t)) return -Number(t.slice(1, -1)); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : s }
  for (const s of r.sections) {
    const ws = wb.addWorksheet(s.title.replace(/[\\/?*[\]:]/g, '').slice(0, 31), { views: [{ showGridLines: false }] })
    ws.getColumn(1).width = 3; ws.getColumn(2).width = 44; for (let c = 3; c <= 9; c++) ws.getColumn(c).width = 16
    if (logo) { const id = wb.addImage({ buffer: logo.data as unknown as ArrayBuffer, extension: logo.ext }); ws.addImage(id, { tl: { col: 6, row: 0 }, ext: { width: 110, height: 32 } }) }
    ws.getCell('B1').value = r.company.toUpperCase() + ' · MANAGEMENT REPORT · ' + r.label.toUpperCase(); ws.getCell('B1').font = { ...font, bold: true, color: { argb: NAVY } }
    ws.getCell('B3').value = s.title.toUpperCase(); ws.getCell('B3').font = { ...font, bold: true, size: 13, color: { argb: NAVY } }
    ws.addRow([])
    const text = (t: string, o: { bold?: boolean; color?: string } = {}) => { const row = ws.addRow(['', t]); ws.mergeCells(row.number, 2, row.number, 8); const c = row.getCell(2); c.alignment = { wrapText: true, vertical: 'top' }; c.font = { ...font, bold: o.bold, color: o.color ? { argb: o.color } : undefined }; row.height = Math.max(16, 15 * Math.ceil(t.length / 110) * t.split('\n').length) }
    if (s.intro) { text(s.intro, { bold: s.key === 'summary' }); ws.addRow([]) }
    for (const [k, v] of s.facts ?? []) { const row = ws.addRow(['', k, v]); row.getCell(2).font = { ...font, bold: true, color: { argb: MUT } }; ws.mergeCells(row.number, 3, row.number, 8) }
    if (s.facts?.length) ws.addRow([])
    if (s.tiles?.length) { for (const t of s.tiles.filter((x) => x.value !== '–')) { const row = ws.addRow(['', t.label, t.value, t.sub ?? '']); row.getCell(3).font = { ...font, bold: true, color: { argb: t.tone ? TONE[t.tone] : NAVY } }; row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }; row.getCell(4).font = { ...font, color: { argb: MUT } } } ws.addRow([]) }
    for (const t of s.tables ?? []) {
      if (t.title) text(t.title, { bold: true, color: NAVY })
      const hr = ws.addRow(['', ...t.head]); hr.eachCell((c) => { c.font = { ...font, bold: true, color: { argb: MUT } }; c.border = { bottom: { style: 'thin', color: { argb: 'FFD9DDE3' } } } })
      for (const rw of t.rows) {
        const row = ws.addRow(['', (rw.kind === 'sub' ? '   ' : '') + rw.label, ...rw.cells.map(toNum)])
        row.eachCell((c, col) => { if (col < 2) return; c.font = { ...font, bold: rw.kind === 'total', color: { argb: rw.tones?.[col - 3] ? TONE[rw.tones[col - 3] as Tone] : rw.kind === 'sub' ? MUT : 'FF1A1A1F' } }; if (col > 2) { c.alignment = { horizontal: 'right' }; if (typeof c.value === 'number') c.numFmt = '#,##0;(#,##0);"-"' } })
      }
      if (t.note) text(t.note, { color: MUT })
      ws.addRow([])
    }
    for (const c of s.charts ?? []) { text(c.title, { bold: true, color: NAVY }); const hr = ws.addRow(['', 'Month', 'Amount']); hr.eachCell((x) => { x.font = { ...font, bold: true, color: { argb: MUT } } }); c.labels.forEach((l, j) => { const row = ws.addRow(['', l, c.values[j] ?? null]); row.getCell(3).numFmt = '#,##0;(#,##0);"-"' }); ws.addRow([]) }
    for (const p of s.pies ?? []) { const tot = p.slices.reduce((a2, x) => a2 + x.value, 0); text(p.title, { bold: true, color: NAVY }); const hr = ws.addRow(['', '', 'Amount', 'Share']); hr.eachCell((x) => { x.font = { ...font, bold: true, color: { argb: MUT } } }); for (const x of p.slices) { const row = ws.addRow(['', x.label, x.value, tot ? x.value / tot : null]); row.getCell(3).numFmt = '#,##0.##'; row.getCell(4).numFmt = '0.0%' } ws.addRow([]) }
    for (const b of s.bullets ?? []) text('• ' + b.text, { color: b.tone ? TONE[b.tone] : undefined })
    for (const t of s.text ?? []) { if (t.head) text(t.head, { bold: true, color: NAVY }); text(t.body) }
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

// ---- Company introduction ------------------------------------------------------------------------------------
// From what the founder already wrote (investor page, report details, settings); the text can be edited in the
// report dialog and is kept for next month.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export async function companyAbout(subject: string, saved?: string): Promise<{ text: string; facts: [string, string][]; leaders: [string, string][] }> {
  const org = (await currentOrg())!
  const main = org.kind === 'company' && subject === 'entity:' + (await companyEntityId())
  const s = org.settings as Record<string, unknown>
  const page = main ? (await db().query<{ headline: string | null; about: string | null; website: string | null }>('SELECT headline, about, website FROM financials.public_pages LIMIT 1').catch(() => ({ rows: [] }))).rows[0] : undefined
  const { profile: p } = main ? await reportProfile().catch(() => ({ profile: null as ReportProfile | null })) : { profile: null as ReportProfile | null }
  const text = saved?.trim() || [page?.headline?.trim(), page?.about?.trim() || p?.principal_activities?.trim()].filter(Boolean).join('\n\n')
  const facts: [string, string][] = []
  const add = (k: string, v: unknown) => { if (typeof v === 'string' && v.trim()) facts.push([k, v.trim()]) }
  if (main) {
    add('Legal name', p?.legal_name && p.legal_name !== org.name ? p.legal_name : '')
    add('Founded', p?.incorporated_on ? (/^\d{4}-\d{2}-\d{2}$/.test(p.incorporated_on) ? new Date(p.incorporated_on + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : p.incorporated_on) : '')
    add('Incorporated in', p?.jurisdiction || (s.country as string) || '')
    add('Legal form', p?.legal_form || '')
    add('Head office', (p?.registered_office || '').split('\n')[0] ?? '')
    add('Website', (s.website as string) || page?.website || '')
    add('Financial year ends', p?.fye_month ? MONTHS[p.fye_month - 1] : '')
  }
  add('Reporting currency', (s.reporting_currency as string) || (s.currency as string) || '')
  const leaders: [string, string][] = []
  if (p) {
    for (const d of p.directors.filter((x) => x.name.trim()).slice(0, 6)) leaders.push([d.role?.trim() || 'Director', d.name.trim()])
    if (p.cfo.name.trim() && !leaders.some(([, n]) => n === p.cfo.name.trim())) leaders.push([p.cfo.role?.trim() || 'Chief Financial Officer', p.cfo.name.trim()])
  }
  return { text, facts, leaders }
}
