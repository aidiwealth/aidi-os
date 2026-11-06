import { shortAmount } from '~/shared/compact'
// The monthly management report: how the business did in one month, for the executive team. The founder picks which
// sections go in; every figure is worked out here from the company's own statements (nothing estimated), with the
// analysis' key points, what to raise, and the founder's own comments. Made as a PDF or an Excel file.
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { burnReview, deriveLines, rollUp, withSecurities, type FinRow } from '~/shared/fin-view'
import { classifyBalance, classifiedRows, periodDetail, safeNote, type SafeTreatment } from '~/shared/bs-classify'
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
  { key: 'forecast', title: 'Forecast', desc: 'The forecast the company uses: the coming months by quarter, best and worst cases, and what it assumes against the actual figures', on: false },
  { key: 'actions', title: 'For the executive team', desc: 'What to raise with the executive team, the CFO and the board', on: true },
  { key: 'comments', title: 'Management comments', desc: 'Your own commentary and priorities for next month', on: true }]

export interface MTile { label: string; value: string; sub?: string; tone?: Tone }
export interface MRow { label: string; cells: string[]; kind?: 'total' | 'sub' | 'head' | 'line'; tones?: (Tone | '')[] }
export interface MTable { title?: string; head: string[]; rows: MRow[]; note?: string }
export interface MChart { title: string; labels: string[]; values: (number | null)[]; pct?: boolean }
// A breakdown (parts of a whole): drawn as a pie, or as bars when the founder prefers.
export interface MPie { title: string; note?: string; slices: { label: string; value: number }[]; pct?: boolean }
export type ChartKind = 'area' | 'line' | 'bar'
export interface MSection { key: string; title: string; intro?: string; facts?: [string, string][]; pies?: MPie[]; tiles?: MTile[]; tables?: MTable[]; charts?: MChart[]; bullets?: { text: string; tone?: Tone; raw?: boolean }[]; text?: { head: string; body: string }[]
  // raw: written by people or the AI about real quarters and months; a quarterly or annual report leaves its wording alone.
  raw?: boolean }
export type Audience = 'board' | 'executive' | 'investor'
export interface MReport { audience?: Audience; kind?: string; company: string; month: string; label: string; currency: string; sections: MSection[]; generated: boolean; business: string | null; chart: ChartKind; pies: boolean }
export type Tone = 'good' | 'watch' | 'risk'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
// The report's period: a month, or (quarterly and annual reports) months rolled into quarters or years. Set while one
// report is built (building is synchronous).
let PER: 'month' | 'quarter' | 'year' = 'month'
const ML = (d: string, short = false) => PER === 'year' ? (short ? "'" + d.slice(2, 4) : d.slice(0, 4)) : PER === 'quarter' ? 'Q' + Math.ceil(Number(d.slice(5, 7)) / 3) + ' ' + (short ? "'" + d.slice(2, 4) : d.slice(0, 4))
  : new Date(d.slice(0, 7) + '-15T00:00:00Z').toLocaleDateString('en-GB', { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric', timeZone: 'UTC' })
// A key point as one sentence pair: the title, then the detail (no doubled full stops, no field names).
// Write-ups about burn figures not agreeing, or cash the balance sheet does not explain (left out when switched off).
const BURN_CHECK = /burn (figures|methods|numbers|estimates)[^.]*(disagree|differ|do not agree|don't agree)|(disagree|differ)[^.]*burn|does not explain the change in cash|doesn't explain the change in cash/i
const point = (x: { title: string; detail: string }) => tidyText(x.title.replace(/[.\s]+$/, '') + '. ' + x.detail, 1100)
// A month's name whatever the report's period (customer trends are monthly in every report).
const MM = (d: string) => new Date(d.slice(0, 7) + '-15T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pctCh = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100)
const sumOf = (rs: { d: Record<string, number | null> }[], k: string) => { const v = rs.map((r) => num(r.d[k])).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null }

// Up to six slices, the rest grouped as "Other".
function pieOf(title: string, xs: { label: string; value: number }[], note?: string, pct = false): MPie {
  const s2 = xs.filter((x) => x.value > 0).sort((p, q) => q.value - p.value)
  const top = s2.slice(0, 6), rest = s2.slice(6).reduce((a, x) => a + x.value, 0)
  return { title, note, slices: rest > 0 ? [...top, { label: 'Other', value: rest }] : top, pct }
}
// Quarterly and annual reports: the months up to the chosen one rolled into quarters or years (flows added, balances
// at the period's end); burn and runway still come from the monthly figures; the wording follows the period.
// Who the report is for. Board: everything. Executive team: payroll folded into running costs, the balance sheet's
// investments, loans, notes, related-party items and equity detail rolled up, runway as a range, no break-even maths,
// and factual points only (no AI strategy advice). Investor: the full figures with factual points only.
export function forAudience<T extends FinRow & { detail?: Record<string, number> | null }>(raw: T[], a: Audience | undefined, withSec: boolean): T[] {
  if (a !== 'executive') return raw
  return raw.map((r) => {
    const l = { ...r.lines } as Record<string, number | null>, pay = typeof l.opex_payroll === 'number' ? l.opex_payroll : null
    if (pay !== null) { l.opex_other = (typeof l.opex_other === 'number' ? l.opex_other : 0) + pay; delete l.opex_payroll }
    const det = r.detail ? Object.fromEntries(Object.entries(r.detail).filter(([k]) => !k.startsWith('opex_payroll|'))) : r.detail
    return { ...r, lines: l, detail: det, derived: withSecurities(deriveLines(l as never, 1), withSec) } as T
  })
}
export function buildMgmtReport(raw0: (FinRow & { detail?: Record<string, number>; cf_generated?: boolean })[], o0: Parameters<typeof buildMonthly>[1] & { period?: 'month' | 'quarter' | 'year' }): MReport {
  const o = { ...o0, withSecurities: o0.audience === 'executive' ? true : o0.withSecurities }
  const raw = forAudience(raw0, o.audience, o.withSecurities)
  if (!o.period || o.period === 'month') return buildMonthly(raw, o)
  const months = raw.filter((r) => r.period_type === 'month' && r.period_end.slice(0, 7) <= o.month.slice(0, 7)).sort((a, b) => a.period_end.localeCompare(b.period_end))
  if (!months.length) throw new Error('No figures for that period.')
  // Each quarter or year: balance sheet categories from its latest month, profit and loss categories added up.
  const rolled = rollUp(months as FinRow[], o.period).map((r) => ({ ...r, period_type: 'month', derived: withSecurities(r.derived ?? deriveLines(r.lines, 3), o.withSecurities), detail: periodDetail(months, r.period_end, (r as { from?: string }).from ?? r.period_end) ?? undefined }))
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
    const fix = (x: unknown): unknown => (typeof x === 'string' ? swap.reduce((t, [a, b]) => t.replace(a, b), x) : Array.isArray(x) ? x.map(fix) : x && typeof x === 'object' && (x as { raw?: boolean }).raw ? x : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 'value' || k === 'labels' ? v : fix(v)])) : x)
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
  chart?: ChartKind; pies?: boolean; reviewRows?: FinRow[]; safe?: SafeTreatment
  // false: no cross-checks of burn and cash ("The burn figures disagree…") anywhere in the report.
  burnChecks?: boolean
  audience?: Audience
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
  const exec = o.audience === 'executive', board = (o.audience ?? 'board') === 'board'
  if (exec) { LBL.opex_other = 'Staff and other operating costs' }
  // Runway: exact for the board and investors, a range for the executive team.
  const RW = (v: number | null | undefined) => (v === null || v === undefined ? '–' : !exec ? v + ' months' : v >= 24 ? 'over 24 months' : v >= 12 ? '12 to 24 months' : v >= 6 ? '6 to 12 months' : 'under 6 months')
  // Break-even arithmetic is left out of the executive version.
  const BE = /break[- ]?even|more revenue or cut|cut (opex|running costs|costs) by|opex cut/i
  const keepPoint = (x: { title?: string; detail?: string; item?: string; why?: string }) => !exec || !BE.test([x.title, x.detail, x.item, x.why].filter(Boolean).join(' '))
  // The last 12 months, from the monthly figures (a quarterly or annual report's rows are quarters or years).
  const monthsUpTo = ((o.reviewRows ?? upTo) as typeof upTo).filter((r) => r.period_end.slice(0, 7) <= (o.reviewRows ? String((o.reviewRows as FinRow[])[(o.reviewRows as FinRow[]).length - 1]?.period_end ?? cur.period_end) : cur.period_end).slice(0, 7)).map((r) => ({ ...r, d: (r as { d?: Record<string, number | null> }).d ?? r.derived ?? deriveLines(r.lines, 1) }))
  const ttm12 = monthsUpTo.slice(-12), ttmRev = sumOf(ttm12 as never, 'revenue')

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
  if (review.status !== 'none') health.push({ area: 'Cash', tone: review.profitable ? 'good' : runLow === null ? 'watch' : runLow < 9 ? 'risk' : runLow < 15 ? 'watch' : 'good', line: review.profitable ? 'Cash-flow positive.' : review.runway !== null ? RW(review.runway) + ' of runway at ' + short(review.burn) + ' a month' + (review.runway_at_loss ? ' (' + RW(review.runway_at_loss) + ' at the loss rate)' : '') + '.' : 'Add a cash balance to see runway.' })

  if (want('intro') && o.about) {
    const team = ['Headcount', 'Employees', 'Team size', 'FTE'].map((k) => num(cur.kpis?.[k])).find((v) => v !== null) ?? null
    const facts: [string, string][] = [...o.about.facts]
    if (team !== null) facts.push(['Team', Math.round(team).toLocaleString('en-US') + ' people'])
    if (bm) facts.push(['Business type', bm.label])
    facts.push(['Revenue, last 12 months', short(ttmRev) + (ttm12.length < 12 ? ' (' + ttm12.length + ' months)' : '')])
    facts.push(...o.about.leaders)
    sections.push({ key: 'intro', title: 'About the company', text: o.about.text.trim() ? [{ head: '', body: o.about.text.trim() }] : undefined, facts })
  }

  if (want('summary')) {
    const ni = g(cur, 'net_income')
    const headline = o.analysis?.headline || [mom !== null ? 'Revenue ' + (mom >= 0 ? 'up ' : 'down ') + Math.abs(mom).toFixed(1).replace(/\.0$/, '') + '% on last month' : '', ni !== null ? (ni >= 0 ? 'a profit of ' : 'a loss of ') + short(Math.abs(ni)) : '', review.runway !== null ? RW(review.runway) + ' of runway' : ''].filter(Boolean).join('; ').replace(/^./, (c) => c.toUpperCase()) + '.'
    sections.push({ key: 'summary', title: 'At a glance', intro: headline,
      tiles: [
        { label: 'Revenue', value: short(rev), sub: mom !== null ? pct(mom) + ' on last month' : undefined, tone: mom === null ? undefined : mom >= 0 ? 'good' : 'risk' },
        { label: 'Gross margin', value: gm === null ? '–' : gm.toFixed(1).replace(/\.0$/, '') + '%', sub: prev && g(prev, 'gross_margin') !== null && gm !== null ? pts(gm - g(prev, 'gross_margin')!) + ' on last month' : undefined },
        { label: ni !== null && ni < 0 ? 'Net loss' : 'Net income', value: short(ni === null ? null : Math.abs(ni)), sub: rev && ni !== null ? Math.abs((ni / rev) * 100).toFixed(1).replace(/\.0$/, '') + '% of revenue' : undefined, tone: ni === null ? undefined : ni >= 0 ? 'good' : 'risk' },
        { label: o.withSecurities ? 'Cash and securities' : 'Cash', value: short(g(cur, 'cash')), sub: prev && g(prev, 'cash') !== null && g(cur, 'cash') !== null ? (g(cur, 'cash')! - g(prev, 'cash')! >= 0 ? 'up ' : 'down ') + short(Math.abs(g(cur, 'cash')! - g(prev, 'cash')!)) + ' in the month' : undefined },
        { label: 'Monthly burn', value: review.profitable ? 'None' : short(review.burn), sub: '3-month average' },
        { label: 'Runway', value: review.profitable ? 'Cash-flow positive' : review.runway !== null ? RW(review.runway) : '–', sub: review.runway_at_loss ? RW(review.runway_at_loss) + ' at the loss rate' : undefined, tone: runLow === null ? undefined : runLow < 9 ? 'risk' : runLow < 15 ? 'watch' : 'good' }],
      tables: health.length ? [{ title: 'Health check', head: ['Area', 'Status', ''], rows: health.map((h) => ({ label: h.area, cells: [h.tone === 'good' ? 'Good' : h.tone === 'watch' ? 'Watch' : 'Risk', h.line], tones: [h.tone, ''] })) }] : undefined,
      bullets: (o.analysis?.insights ?? []).filter(keepPoint).filter((x) => o.burnChecks !== false || !BURN_CHECK.test(x.title + ' ' + x.detail)).slice(0, 4).map((x) => ({ text: point(x), tone: x.tone, raw: true })) })
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
    t.rows.push({ label: LBL.burn!, cells: [review.profitable ? 'None' : money(review.burn), '', '', '', '', ''] }, { label: LBL.runway!, cells: [review.runway === null ? '–' : exec ? RW(review.runway) : String(review.runway), '', '', '', '', ''] })
    if (!yoy) { t.head.splice(4, 2); for (const rw of t.rows) { rw.cells.splice(3, 2); rw.tones?.splice(3, 2) } }
    sections.push({ key: 'scorecard', title: 'Key numbers', intro: 'Amounts in ' + cy + '. Year to date from ' + ML(fyStart + '-01') + '.', tables: [t] })
  }

  if (want('growth')) {
    const six = monthsUpTo.slice(-7), r0 = num(six[0]?.d.revenue), r6 = num(six[six.length - 1]?.d.revenue)
    const cmgr = six.length === 7 && r0 && r6 && r0 > 0 && r6 > 0 ? (Math.pow(r6 / r0, 1 / 6) - 1) * 100 : null
    const ytdG = pctCh(sumOf(ytd, 'revenue'), ytdLy.length === ytd.length ? sumOf(ytdLy, 'revenue') : null)
    sections.push({ key: 'growth', title: 'Revenue and growth',
      tiles: [{ label: 'On last month', value: pct(mom), tone: mom === null ? undefined : mom >= 0 ? 'good' : 'risk' }, { label: 'Last 3 months vs the 3 before', value: pct(g3), tone: g3 === null ? undefined : g3 >= 0 ? 'good' : 'risk' }, { label: 'On the same month last year', value: pct(yo), tone: yo === null ? undefined : yo >= 0 ? 'good' : 'risk' },
        { label: 'Monthly growth (6 months)', value: pct(cmgr), sub: 'average a month' }, { label: 'Year to date vs last year', value: pct(ytdG) }, { label: 'Revenue, last 12 months', value: short(ttmRev) }],
      charts: [{ title: 'Revenue by month', labels: last12.map((r) => ML(r.period_end, true)), values: last12.map((r) => g(r, 'revenue')) }, { title: 'Gross profit by month', labels: last12.map((r) => ML(r.period_end, true)), values: last12.map((r) => g(r, 'gross_profit')) }] })
  }

  // Lines with the company's own categories under them (detail "<line>|<name>").
  const withCats = (keys: string[], cols: ((k: string) => number | null)[], detailCols: ((k: string) => number | null)[]) => {
    const out: MRow[] = []
    for (const k of keys) {
      const vals = cols.map((f) => f(k)); if (vals.every((v) => v === null)) continue
      // Executive team: staff and other costs are only part of Total running costs (their categories still show).
      if (!(exec && k === 'opex_other')) out.push({ label: LBL[k] ?? k, kind: ['gross_profit', 'ebitda', 'net_income', 'opex_total', 'total_assets', 'total_liabilities', 'equity'].includes(k) ? 'total' : 'line', cells: vals.map(money) })
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
      const names = [...new Set([cur, prev].flatMap((r) => Object.keys(r?.detail ?? {})).filter((x) => x.startsWith(k + '|')))]
      if (names.length && k !== 'cogs') for (const n of names) items.push({ label: n.slice(k.length + 1), a: det(cur, n), b: det(prev, n) })
      // A group adds up companies that may itemise a line differently: what the categories do not explain stays as its own item.
      // Executive team: what staff and other costs' categories do not explain (payroll among it) stays in running costs.
      if (exec && k === 'opex_other') { if (names.length) continue }
      if (names.length && k !== 'cogs') { const rest = (r: typeof cur | null) => { const t = g(r, k); return t === null ? null : t - names.reduce((a, n) => a + (det(r, n) ?? 0), 0) }; const a = rest(cur), b = rest(prev); if ((a !== null && Math.abs(a) >= 1) || (b !== null && Math.abs(b) >= 1)) items.push({ label: LBL[k]!.startsWith('Other') ? 'Uncategorised ' + LBL[k]!.slice(6) : 'Other ' + LBL[k]!.toLowerCase(), a, b }) }
      else if (!(exec && k === 'opex_other') && (g(cur, k) !== null || g(prev, k) !== null)) items.push({ label: LBL[k]!, a: g(cur, k), b: g(prev, k) })
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
        { label: 'Runway', value: review.profitable ? 'Cash-flow positive' : review.runway !== null ? RW(review.runway) : '–', tone: runLow === null ? undefined : runLow < 9 ? 'risk' : runLow < 15 ? 'watch' : 'good' }, ...(review.runway_at_loss ? [{ label: 'Runway at the loss rate', value: RW(review.runway_at_loss), sub: 'once unpaid bills are settled' }] : []), ...(review.loss_burn ? [{ label: 'Loss before depreciation', value: short(review.loss_burn), sub: 'a month, 3-month average' }] : [])],
      charts: [{ title: 'Cash at the end of each month', labels: last12.map((r) => ML(r.period_end, true)), values: last12.map((r) => g(r, 'cash')) }],
      bullets: o.burnChecks === false ? undefined : [...review.notes.map((t) => ({ text: t })), ...review.issues.map((t) => ({ text: t, tone: 'watch' as Tone }))] })
  }

  if (want('balance')) {
    // Classified like QuickBooks and audited accounts: current and non-current assets and liabilities, and equity, with
    // the company's own categories under each (shared/bs-classify.ts). SAFEs sit where the company chose (settings).
    // The figures as saved are used: cash is the bank balance, treasury bills are short-term investments.
    const cl = (r: typeof cur | null) => (r ? classifyBalance(r.lines, r.detail, { safe: o.safe ?? null }) : null)
    // Executive team: one cash and securities line; investments, loans, notes and related-party items rolled into
    // other assets; equity as one line.
    const roll = (c: ReturnType<typeof classifyBalance> | null) => {
      if (!c || !exec) return c
      const out: typeof c.items = []
      const add = (key: string, label: string, group: typeof c.items[number]['group'], v: number) => { const x = out.find((i) => i.key === key); if (x) x.value = Math.round((x.value + v) * 100) / 100; else out.push({ key, label, group, value: v }) }
      for (const i of c.items) {
        if (i.key === 'cash' || i.key === 'investments' || i.key.startsWith('cash|') || i.key.startsWith('investments|')) add('cash', 'Cash and securities', 'ca', i.value)
        else if (i.group === 'eq') add('equity', "Shareholders' equity", 'eq', i.value)
        else if ((i.group === 'ca' || i.group === 'nca') && (i.key.startsWith('long_term_investments') || /loan|notes? receivable|related[- ]party|intercompany/i.test(i.label))) add(i.group === 'ca' ? 'x_ca' : 'x_nca', i.group === 'ca' ? 'Other current assets' : 'Other non-current assets', i.group, i.value)
        else out.push({ ...i })
      }
      return { ...c, items: out }
    }
    const C = roll(cl(cur))!, P = roll(cl(prev)), O = openRow ? roll(cl(openRow)) : null
    // The same quarter (or month, or year) a year earlier, to compare year on year.
    const lyEnd = String(Number(cur.period_end.slice(0, 4)) - 1) + cur.period_end.slice(4, 7)
    const lyRow = rows.find((r) => r.period_end.slice(0, 7) === lyEnd) ?? null, LY = lyRow ? roll(cl(lyRow)) : null
    const empty = classifyBalance({}, null)
    const t = classifiedRows([C, P ?? empty, O ?? empty, LY ?? empty])
    const fx = (v: number | null, ratio: boolean) => (v === null ? '–' : ratio ? v.toFixed(2) + 'x' : money(v))
    const rowsB: MRow[] = t.rows.map((r) => {
      const ratio = r.key === 'current_ratio', a = r.values[0] ?? null, b = r.values[1] ?? null, c = r.values[2] ?? null, y = r.values[3] ?? null
      // A line that is new this period (or gone) changes from (or to) nothing; ratios need both.
      const ch = r.kind === 'head' || (a === null && b === null) || !P ? null : ratio ? (a === null || b === null ? null : a - b) : (a ?? 0) - (b ?? 0)
      return { label: r.label + (r.moved ? ' *' : ''), kind: r.kind === 'head' ? 'head' : r.kind === 'item' ? 'sub' : r.kind === 'ratio' ? 'line' : 'total',
        cells: r.kind === 'head' ? ['', '', '', ...(LY ? [''] : []), ...(O ? [''] : [])] : [fx(a, ratio), P ? fx(b, ratio) : '–', ratio ? (ch === null ? '–' : (ch >= 0 ? '+' : '−') + Math.abs(ch).toFixed(2)) : money(ch), ...(LY ? [fx(y, ratio)] : []), ...(O ? [fx(c, ratio)] : [])] }
    })
    const note = safeNote(t.moved, o.safe ?? null, (v) => short(v))
    // Movement in shareholders' equity, so equity ties to the result: opening, net income, other movements (exchange
    // rates on the group's foreign companies, shares issued, adjustments) and closing. Not in the executive version.
    const niP = g(cur, 'net_income'), niY = ytd.some((r) => g(r, 'net_income') !== null) ? sumOf(ytd, 'net_income') : null
    const eqMove = (open: typeof C | null, ni: number | null) => (open && ni !== null && open.items.some((x) => x.group === 'eq') ? { open: open.totals.eq, ni, other: C.totals.eq - open.totals.eq - ni, close: C.totals.eq } : null)
    const mQ = eqMove(P, niP), mY = eqMove(O, niY)
    const eqTable: MTable[] = !exec && (mQ || mY) ? [{ title: "Movement in shareholders' equity", head: ['', ML(cur.period_end, true), 'Year to date'], rows: [
      { label: 'Opening equity', cells: [money(mQ?.open ?? null), money(mY?.open ?? null)] }, { label: 'Net income (loss)', cells: [money(mQ?.ni ?? null), money(mY?.ni ?? null)] },
      { label: 'Exchange rates and other movements', cells: [money(mQ ? Math.round(mQ.other) : null), money(mY ? Math.round(mY.other) : null)] },
      { label: 'Closing equity', kind: 'total', cells: [money(mQ?.close ?? null), money(mY?.close ?? null)] }] }] : []
    // Retained earnings should move by the net income: a difference is flagged for the accountant (board version).
    const reOf = (c: typeof C | null) => c?.items.find((x) => /retained earnings|accumulated (deficit|losses)/i.test(x.label))?.value ?? null
    const reGap = (open: typeof C | null, ni: number | null) => { const a = reOf(C), b = reOf(open); return a !== null && b !== null && ni !== null ? a - b - ni : null }
    const gq = reGap(P, niP), gy = reGap(O, niY)
    const reFlag = board && ((gq !== null && Math.abs(gq) >= Math.max(100, Math.abs(niP ?? 0) * 0.01)) || (gy !== null && Math.abs(gy) >= Math.max(100, Math.abs(niY ?? 0) * 0.01)))
      ? [{ text: 'Retained earnings did not move by the net income: a difference of ' + money(Math.round(gq ?? 0)) + ' this period' + (gy !== null ? ' and ' + money(Math.round(gy)) + ' year to date' : '') + '. Ask the accountant: usually exchange rates on a foreign company, a prior-period adjustment or a dividend.', tone: 'watch' as Tone }] : []
    const pick = (gs: string[]) => C.items.filter((x) => gs.includes(x.group) && x.value > 0).map((x) => ({ label: x.label, value: x.value }))
    const balPies = [pieOf('What the company owns', pick(['ca', 'nca']), 'Assets at ' + ML(cur.period_end)), pieOf('What it owes', pick(['cl', 'ncl']), 'Liabilities at ' + ML(cur.period_end))].filter((x) => x.slices.length >= 2)
    sections.push({ key: 'balance', title: 'Balance sheet', intro: note ? '* ' + note : undefined, pies: balPies,
      tiles: [{ label: 'Working capital', value: short(C.workingCapital), sub: 'current assets less current liabilities', tone: C.workingCapital === null ? undefined : C.workingCapital >= 0 ? 'good' : 'risk' },
        { label: 'Current ratio', value: C.currentRatio === null ? '–' : C.currentRatio.toFixed(2) + 'x', sub: 'current assets for each unit of current liabilities', tone: C.currentRatio === null ? undefined : C.currentRatio >= 1.2 ? 'good' : C.currentRatio >= 1 ? 'watch' : 'risk' },
        { label: "Shareholders' equity", value: short(C.totals.eq), tone: C.totals.eq < 0 ? 'risk' : undefined }],
      tables: [{ head: ['', ML(cur.period_end, true), prev ? ML(prev.period_end, true) : 'Last month', 'Change', ...(LY ? [ML(lyRow!.period_end, true)] : []), ...(O ? ['Start of year'] : [])], rows: rowsB }, ...eqTable], bullets: reFlag.length ? reFlag : undefined })
  }

  if (want('cashflow')) {
    const CK = ['operating_cf', 'investing_cf', 'financing_cf']
    const net = (r: typeof cur | null) => (r && CK.some((k) => g(r, k) !== null) ? CK.reduce((s, k) => s + (g(r, k) ?? 0), 0) : null)
    const rowsCf: MRow[] = CK.filter((k) => g(cur, k) !== null || g(prev, k) !== null).map((k) => ({ label: LBL[k]!, cells: [money(g(cur, k)), money(g(prev, k)), money(sumOf(ytd, k))] }))
    // The change in cash on the balance sheet decides the net change; what the cash flow lines do not explain is shown
    // as its own line, so the statement always agrees with the balance sheet.
    const bank = (r: typeof cur | null) => (r ? num(r.lines.cash) : null)
    const chg = (a2: typeof cur | null, b2: typeof cur | null) => (bank(a2) !== null && bank(b2) !== null ? bank(a2)! - bank(b2)! : null)
    const prev2 = i > 1 ? rows[i - 2]! : null
    const cols = [{ n: net(cur), c: chg(cur, prev) }, { n: net(prev), c: chg(prev, prev2) }, { n: ytd.some((r) => net(r) !== null) ? ytd.reduce((s, r) => s + (net(r) ?? 0), 0) : null, c: chg(cur, openRow) }]
    const gap = cols.map((x) => (x.n !== null && x.c !== null && Math.abs(x.c - x.n) >= 1 ? x.c - x.n : null))
    if (rowsCf.length && gap.some((x) => x !== null)) rowsCf.push({ label: 'Exchange rate effects and other movements', cells: gap.map((x) => money(x ?? 0)) })
    if (rowsCf.length) rowsCf.push({ label: 'Net change in cash', kind: 'total', cells: cols.map((x) => money(x.c ?? x.n)) }, { label: 'Cash at the end', cells: [money(bank(cur)), money(bank(prev)), money(bank(cur))] })
    // The headline and the balance sheet count treasury bills and other securities with cash: show how the two meet.
    const sec = (r: typeof cur | null) => (r ? num(r.lines.investments) : null)
    if (rowsCf.length && (sec(cur) || sec(prev))) rowsCf.push({ label: 'Treasury bills and other securities', cells: [money(sec(cur)), money(sec(prev)), money(sec(cur))] },
      { label: 'Cash and securities at the end', kind: 'total', cells: [money((bank(cur) ?? 0) + (sec(cur) ?? 0)), money(prev ? (bank(prev) ?? 0) + (sec(prev) ?? 0) : null), money((bank(cur) ?? 0) + (sec(cur) ?? 0))] })
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
    const lbls = f.trend ? (f.trend.labels as string[]).map((m) => MM(m + '-01')) : []
    const mv = 'Change in monthly revenue (' + cur.currency + '), 3 months to ' + MM(String(f.as_of) + '-01')
    const n3 = (f.last_3_months_customers ?? {}) as Record<string, number | undefined>
    const P0 = (v: unknown) => (v == null ? '–' : v + '%')
    // Thresholds for usage-based billing, and the strongest fact first: the customer group with most of the revenue.
    const usage = f.billing === 'usage', gOk = usage ? 85 : 90, gWatch = usage ? 70 : 80
    const top = !f.only && Array.isArray(f.groups) ? [...(f.groups as { group: string; share_pct: number | null; nrr_pct: number | null; logo_churn_pct: number | null }[])].filter((x) => x.share_pct !== null && x.group !== 'Not set').sort((a2, b2) => b2.share_pct! - a2.share_pct!)[0] : undefined
    const lead = top && top.share_pct! >= 50 && top.nrr_pct !== null ? Math.round(top.share_pct!) + '% of revenue comes from ' + top.group + ' customers, who kept ' + P0(top.nrr_pct) + ' of their spend' + (top.logo_churn_pct === 0 ? '; none left' : top.logo_churn_pct !== null ? '; ' + P0(top.logo_churn_pct) + ' of them left' : '') + '. ' : ''
    type Pts = { headline?: string; insights?: { title: string; detail: string; tone: Tone }[] } | null | undefined
    const pts = (a: Pts) => (a?.insights?.length ? { bullets: a.insights.slice(0, 4).map((x) => ({ text: point(x), tone: x.tone, raw: true })) } : {})
    const head = (a: Pts) => (a?.headline ? ' ' + tidyText(a.headline, 300) : '')
    const P = (f.points ?? {}) as { retention?: Pts; customers?: Pts }
    if (want('retention')) sections.push({ key: 'retention', title: 'Revenue retention' + (f.only ? ' · ' + f.only : ''), intro: who + lead + 'From your customer data up to ' + ML(String(f.as_of) + '-01') + '. Revenue retention compares the same customers a year apart: net includes customers who spend more, gross does not.' + head(P.retention), ...pts(P.retention),
      tiles: [{ label: 'Net revenue retention (12 months)', value: P0(f.nrr_12m_pct), tone: f.nrr_12m_pct == null ? undefined : f.nrr_12m_pct >= 100 ? 'good' : f.nrr_12m_pct >= 90 ? 'watch' : 'risk', sub: f.nrr_12m_pct_3_months_ago == null ? undefined : P0(f.nrr_12m_pct_3_months_ago) + ' three months ago' },
        { label: 'Gross revenue retention', value: P0(f.grr_12m_pct), tone: f.grr_12m_pct == null ? undefined : f.grr_12m_pct >= gOk ? 'good' : f.grr_12m_pct >= gWatch ? 'watch' : 'risk', sub: usage ? 'usage-based: 70–85% is common' : undefined },
        ...(f.revenue_lost_with_lost_customers_12m_pct != null ? [{ label: 'Revenue churn (12 months)', value: P0(f.revenue_lost_with_lost_customers_12m_pct), sub: f.logo_churn_12m_pct != null ? P0(f.logo_churn_12m_pct) + ' of accounts left' + (f.logo_churn_12m_pct > f.revenue_lost_with_lost_customers_12m_pct * 2 ? ', mostly small' : '') : 'of last year\'s revenue', tone: (f.revenue_lost_with_lost_customers_12m_pct <= 5 ? 'good' : f.revenue_lost_with_lost_customers_12m_pct <= 10 ? 'watch' : 'risk') as Tone }]
          : [{ label: 'Accounts lost (12 months)', value: P0(f.logo_churn_12m_pct), sub: f.customers_a_year_ago ? 'of ' + Number(f.customers_a_year_ago).toLocaleString('en-US') + ' a year ago' : undefined }]),
        { label: 'Year-1 cohort retention', value: P0(f.cohort_m12_retention_pct), sub: 'average across cohorts' }],
      charts: f.trend ? [{ title: 'Net revenue retention, 12 months', labels: lbls, values: f.trend.nrr, pct: true }, { title: 'Gross revenue retention, 12 months', labels: lbls, values: f.trend.grr ?? [], pct: true }, (f.trend.rev_lost?.some((v: number | null) => v !== null) ? { title: 'Revenue churn (revenue lost with customers who left), 12 months', labels: lbls, values: f.trend.rev_lost, pct: true } : { title: 'Accounts lost, 12 months', labels: lbls, values: f.trend.churn ?? [], pct: true })] : undefined,
      pies: (() => { const sl = [['New customers', l3.new], ['Spending more', l3.expansion], ['Spending less', l3.contraction], ['Lost', l3.churned]].map(([l, v]) => ({ label: String(l), value: Math.abs(num(v) ?? 0) })); return sl.some((x) => x.value > 0) ? [pieOf(mv, sl, 'Size of each movement')] : [] })(),
      tables: [{ title: mv, head: ['', 'Customers', 'Change in monthly revenue (' + cur.currency + ')'], rows: [['New customers', l3.new, n3.new], ['Existing customers spending more', l3.expansion, n3.expansion], ['Existing customers spending less', l3.contraction, n3.contraction], ['Customers lost', l3.churned, n3.churned]].map(([l, v, n]) => ({ label: String(l), cells: [n === undefined ? '–' : Number(n).toLocaleString('en-US'), money(num(v))] })) },
        ...(!f.only && Array.isArray(f.groups) && f.groups.length > 1 ? [{ title: 'Retention by customer group (' + String(f.group_by) + ')', head: ['', 'Paying customers', 'Share', 'Net', 'Gross', 'Accounts lost'], rows: (f.groups as { group: string; customers: number; share_pct: number | null; nrr_pct: number | null; grr_pct: number | null; logo_churn_pct: number | null }[]).map((g) => ({ label: g.group, cells: [Number(g.customers).toLocaleString('en-US'), P0(g.share_pct), P0(g.nrr_pct), P0(g.grr_pct), P0(g.logo_churn_pct)] })) }] : [])] })
    if (want('customers')) sections.push({ key: 'customers', title: 'Customers' + (f.only ? ' · ' + f.only : ''), intro: who + 'From your customer data up to ' + ML(String(f.as_of) + '-01') + '.' + head(P.customers), ...pts(P.customers),
      tiles: [{ label: 'Paying customers', value: f.active == null ? '–' : Number(f.active).toLocaleString('en-US') }, { label: 'Annual recurring revenue', value: short(f.arr ?? null) }, { label: 'Average customer', value: short(f.arpa_month ?? null), sub: 'a month' },
        { label: 'Top 10 customers', value: P0(f.top10_share_pct), sub: 'of revenue' }, ...(f.ltv_to_cac != null ? [{ label: 'Lifetime value to acquisition cost', value: f.ltv_to_cac + '×', tone: (f.ltv_to_cac >= 3 ? 'good' : f.ltv_to_cac >= 1.5 ? 'watch' : 'risk') as Tone }] : [])],
      charts: f.trend ? [{ title: 'Annual recurring revenue', labels: lbls, values: f.trend.arr }, { title: 'Paying customers', labels: lbls, values: f.trend.active ?? [] }] : undefined,
      pies: [
        ...(Array.isArray(f.sectors) && f.sectors.length >= 2 ? [pieOf('Revenue by customer sector', (() => { const xs = (f.sectors as { sector: string; share_pct: number }[]).map((x) => ({ label: x.sector, value: x.share_pct })); const left = 100 - xs.reduce((a2, x) => a2 + x.value, 0); return left >= 0.1 ? [...xs, { label: 'Other sectors', value: Math.round(left * 10) / 10 }] : xs })(), 'Share of revenue, last 12 months', true)] : []),
        ...(Array.isArray(f.top) && f.top.length ? [pieOf('How concentrated revenue is', [...(f.top as { name: string; share_pct: number }[]).map((x) => ({ label: x.name, value: x.share_pct })), { label: 'All other customers', value: Math.max(0, 100 - (f.top as { share_pct: number }[]).reduce((a2: number, x) => a2 + x.share_pct, 0)) }], 'Top 5 customers against the rest, last 12 months', true)] : [])],
      tables: [
        ...(Array.isArray(f.sectors) && f.sectors.length ? [{ title: 'Revenue by customer sector', head: ['', 'Share', 'Paying customers', 'Growth', 'Revenue retention'], rows: (f.sectors as { sector: string; share_pct: number; customers: number; growth_pct: number | null; nrr_pct: number | null }[]).map((x) => ({ label: x.sector, cells: [x.share_pct + '%', Number(x.customers).toLocaleString('en-US'), pct(x.growth_pct), x.nrr_pct == null ? '–' : x.nrr_pct + '%'] })) }] : []),
        ...(Array.isArray(f.top) && f.top.length ? [{ title: 'Top customers (last 12 months)', head: ['', 'Revenue', 'Share', 'Growth'], rows: (f.top as { name: string; ttm: number; share_pct: number; growth_pct: number | null }[]).map((x) => ({ label: x.name, cells: [money(x.ttm), x.share_pct + '%', pct(x.growth_pct)] })) }] : [])] })
  }

  if (want('actions')) {
    const fl = (o.analysis?.flags ?? []).filter(keepPoint).filter((f) => o.burnChecks !== false || !BURN_CHECK.test(f.item + ' ' + f.why))
    const by = ['Executive team', 'CFO', 'Board'].map((w) => ({ w, xs: fl.filter((f) => f.for === w) })).filter((x) => x.xs.length)
    // With nothing flagged, the areas the health check marks to watch or at risk are what to discuss.
    const hw = health.filter((h) => h.tone !== 'good')
    if (o.audience !== 'investor') sections.push({ key: 'actions', title: board ? 'For the board' : 'For the executive team', text: by.length ? by.map((x) => ({ head: x.w, body: x.xs.map((f) => '• ' + f.item + ': ' + f.why).join('\n') })) : hw.length ? [{ head: 'To discuss', body: hw.map((h) => '• ' + h.area + ' (' + (h.tone === 'risk' ? 'at risk' : 'to watch') + '): ' + h.line).join('\n') }] : [{ head: '', body: 'Nothing to raise this month.' }] })
  }

  if (want('comments') && (o.comments.trim() || o.priorities.trim())) {
    // Your own words, kept as written (a quarterly report does not reword them). For the executive team the same rules
    // as the tables apply: sentences about payroll, break-even workings, loans, notes or equity detail are left out and
    // runway is given as a range.
    const scrub = (t: string) => !exec ? t : t.split(/\n/).map((para) => para.split(/(?<=[.!?])\s+/).filter((x) => !/payroll|salar|break[- ]?even|% cut|\bcut by\b|% increase|loans? receivable|notes? receivable|related[- ]party|SAFE|treasury stock|buyback/i.test(x))
      .map((x) => x.replace(/(\d+(?:\.\d+)?)\s+months? of (cash )?runway/gi, (_m, n) => RW(Number(n)) + ' of runway').replace(/runway of (\d+(?:\.\d+)?) months?/gi, (_m, n) => 'runway of ' + RW(Number(n)))).join(' ')).filter((x) => x.trim()).join('\n')
    const cm = scrub(o.comments.trim()), pr = scrub(o.priorities.trim()), nx = PER === 'month' ? 'month' : PER
    if (cm || pr) sections.push({ key: 'comments', title: 'Management comments', raw: true, text: [...(cm ? [{ head: 'Comments', body: cm }] : []), ...(pr ? [{ head: 'Priorities for next ' + nx, body: pr }] : [])] })
  }
  // Keep the founder's chosen order.
  sections.sort((a, b) => MR_SECTIONS.findIndex((s) => s.key === a.key) - MR_SECTIONS.findIndex((s) => s.key === b.key))
  return { audience: o.audience ?? 'board', company: o.company, month: cur.period_end, label: ML(cur.period_end), currency: cy, sections, generated: !!cur.cf_generated, business: bm?.label ?? null, chart: o.chart ?? 'area', pies: o.pies !== false }
}
const fmtK = (v: number | null) => (v === null ? '–' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100))

// ---- PDF ------------------------------------------------------------------------------------------------------
const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/−/g, '-').replace(/•/g, '-').replace(/₦/g, 'NGN ').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF\n£€]/g, '')
// Who the report is for and what the figures are; on the PDF cover and at the top of every Excel sheet.
export const preparedFor = (r: MReport) => 'Prepared for ' + (r.audience === 'executive' ? 'the executive team' : r.audience === 'investor' ? 'investors' : 'the board') + (r.kind === 'Forecast' ? '. A forecast in ' + r.currency + ': estimates from the assumptions shown, not results.' : '. Management figures in ' + r.currency + ', unaudited.') + (r.business ? ' Business type: ' + r.business + '.' : '')
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
    const t = (r.kind === 'Forecast' ? 'FORECAST' : 'MANAGEMENT REPORT') + ' · ' + r.label.toUpperCase(); page.drawText(clean(t), { x: W - M - bold.widthOfTextAtSize(clean(t), 8), y, size: 8, font: bold, color: mut })
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
  para(preparedFor(r), { color: mut, size: 9.5, gap: 14 })

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
      const f = rw.kind === 'total' || rw.kind === 'head' ? bold : reg, size = rw.kind === 'sub' ? 8.5 : 9
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
    const isPct = p.pct ?? (Math.abs(total - 100) < 0.6 && p.slices.every((x) => x.value <= 100))
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
      // Boxes, like the figures elsewhere in the report: three to a row, the label above the value.
      const cols = 3, gap = 10, w = (W - M * 2 - gap * (cols - 1)) / cols
      for (let k = 0; k < s.facts.length; k += cols) {
        const row = s.facts.slice(k, k + cols), vals = row.map(([, v]) => wrap(v, bold, 10.5, w - 16).slice(0, 3))
        const h = 26 + Math.max(...vals.map((l) => l.length)) * 13
        ensure(h + gap)
        row.forEach(([lab], q) => {
          const x = M + q * (w + gap)
          page.drawRectangle({ x, y: y - h, width: w, height: h, color: soft, borderColor: rule, borderWidth: 0.6 })
          page.drawText(fit(lab.toUpperCase(), bold, 7, w - 16), { x: x + 8, y: y - 13, size: 7, font: bold, color: mut })
          vals[q]!.forEach((l, z) => page.drawText(l, { x: x + 8, y: y - 28 - z * 13, size: 10.5, font: bold, color: navy }))
        })
        y -= h + gap
      }
      y -= 4
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
// Charts on the PDF label every third month; the Excel table names each one ("Oct 26" → "Nov 26").
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function nextMonthLabel(prev: string): string {
  const m = /^([A-Z][a-z]{2}) (')?(\d{2})$/.exec(prev), i = m ? MON3.indexOf(m[1]!) : -1
  if (!m || i < 0) return ''
  const y = Number(m[3]) + (i === 11 ? 1 : 0)
  return MON3[(i + 1) % 12] + ' ' + (m[2] ?? '') + String(y % 100).padStart(2, '0')
}
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
    ws.getCell('B1').value = r.company.toUpperCase() + (r.kind === 'Forecast' ? ' · FORECAST · ' : ' · MANAGEMENT REPORT · ') + r.label.toUpperCase(); ws.getCell('B1').font = { ...font, bold: true, color: { argb: NAVY } }
    ws.getCell('B2').value = preparedFor(r); ws.getCell('B2').font = { ...font, size: 9.5, color: { argb: MUT } }
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
        row.eachCell((c, col) => { if (col < 2) return; c.font = { ...font, bold: rw.kind === 'total' || rw.kind === 'head', color: { argb: rw.tones?.[col - 3] ? TONE[rw.tones[col - 3] as Tone] : rw.kind === 'sub' ? MUT : 'FF1A1A1F' } }; if (col > 2) { c.alignment = { horizontal: 'right' }; if (typeof c.value === 'number') c.numFmt = '#,##0;(#,##0);"-"' } })
      }
      if (t.note) text(t.note, { color: MUT })
      ws.addRow([])
    }
    for (const c of s.charts ?? []) { text(c.title, { bold: true, color: NAVY }); const hr = ws.addRow(['', 'Month', 'Amount']); hr.eachCell((x) => { x.font = { ...font, bold: true, color: { argb: MUT } } }); let last = ''; c.labels.forEach((l, j) => { last = l || nextMonthLabel(last); const v = c.values[j]; const row = ws.addRow(['', last, typeof v === 'number' ? Math.round(v) : null]); row.getCell(3).numFmt = '#,##0;(#,##0);"-"' }); ws.addRow([]) }
    for (const p of s.pies ?? []) { const tot = p.slices.reduce((a2, x) => a2 + x.value, 0); text(p.title, { bold: true, color: NAVY }); const hr = ws.addRow(['', '', 'Amount', 'Share']); hr.eachCell((x) => { x.font = { ...font, bold: true, color: { argb: MUT } } }); for (const x of p.slices) { const row = ws.addRow(['', x.label, Math.round(x.value), tot ? x.value / tot : null]); row.getCell(3).numFmt = '#,##0;(#,##0)'; row.getCell(4).numFmt = '0.0%' } ws.addRow([]) }
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
  // The reporting currency is on the cover line, not a box of its own.
  const leaders: [string, string][] = []
  if (p) {
    for (const d of p.directors.filter((x) => x.name.trim()).slice(0, 6)) leaders.push([d.role?.trim() || 'Director', d.name.trim()])
    if (p.cfo.name.trim() && !leaders.some(([, n]) => n === p.cfo.name.trim())) leaders.push([p.cfo.role?.trim() || 'Chief Financial Officer', p.cfo.name.trim()])
  }
  return { text, facts, leaders }
}
