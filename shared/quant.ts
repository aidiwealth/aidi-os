// Public Markets valuation maths: plain functions, no data access, the same on the server and in tests. Every rate is
// in percent (6.8 means 6.8%). The approach follows the DeMarzo framework: beta from monthly excess returns, cost of
// capital from CAPM, value from ten years of free cash flow plus a terminal value at the WACC, then reverse DCF,
// scenarios and break-evens to show what the price assumes and which inputs matter. MODEL_VERSION is stored with
// every valuation, so a changed formula never silently changes an old number.
export const MODEL_VERSION = '1.0'

const r2 = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d
const median = (xs: number[]) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2 }
const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

// ── Beta ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Two-sided 95% Student t value (Cornish-Fisher expansion; within 0.001 of the tables from 10 degrees of freedom).
export function t975(df: number): number {
  const z = 1.959963985, d = Math.max(1, df)
  return z + (z ** 3 + z) / (4 * d) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * d ** 2) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * d ** 3)
}
export interface Regression { beta: number; alpha: number; r2: number; se: number; ci: [number, number]; n: number }
// Least squares y = alpha + beta·x, with the standard error and 95% range of beta.
export function regress(x: number[], y: number[]): Regression | null {
  const n = Math.min(x.length, y.length)
  if (n < 3) return null
  let sx = 0, sy = 0
  for (let i = 0; i < n; i++) { sx += x[i]!; sy += y[i]! }
  const mx = sx / n, my = sy / n
  let sxx = 0, sxy = 0, syy = 0
  for (let i = 0; i < n; i++) { const dx = x[i]! - mx, dy = y[i]! - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy }
  if (sxx === 0) return null
  const beta = sxy / sxx, alpha = my - beta * mx
  let sse = 0
  for (let i = 0; i < n; i++) { const e = y[i]! - alpha - beta * x[i]!; sse += e * e }
  const se = Math.sqrt(sse / (n - 2) / sxx), t = t975(n - 2)
  return { beta, alpha, r2: syy ? 1 - sse / syy : 0, se, ci: [beta - t * se, beta + t * se], n }
}
// Blume's adjustment: betas drift towards 1 over time.
export const blume = (b: number) => 0.67 * b + 0.33

export interface Px { d: string; close: number }
// The last close of each month.
export function monthEnds(px: Px[]): { m: string; close: number }[] {
  const out = new Map<string, number>()
  for (const p of [...px].sort((a, b) => (a.d < b.d ? -1 : 1))) if (p.close > 0) out.set(p.d.slice(0, 7), p.close)
  return [...out].map(([m, close]) => ({ m, close }))
}
const monthlyReturns = (px: Px[]) => { const e = monthEnds(px); const out = new Map<string, number>(); for (let i = 1; i < e.length; i++) out.set(e[i]!.m, e[i]!.close / e[i - 1]!.close - 1); return out }
export interface BetaResult extends Regression { adjusted: number; months: number; from: string; to: string; flags: string[]; points: { m: string; x: number; y: number }[] }
// Beta from monthly excess returns over the market (SPY, dividends included), the risk-free rate being the 3-month
// T-bill for each month (annual percent, turned into a monthly rate). The last `months` months both have, at least 36.
// The month still running is left out.
export function betaOf(asset: Px[], market: Px[], rf: Record<string, number>, months = 60, today = new Date().toISOString().slice(0, 7)): BetaResult | null {
  const a = monthlyReturns(asset), m = monthlyReturns(market)
  const keys = [...a.keys()].filter((k) => m.has(k) && k < today).sort()
  let lastRf: number | null = null
  const rows: { m: string; x: number; y: number }[] = []
  const rfKeys = Object.keys(rf).sort()
  for (const k of keys) {
    const r: number | null | undefined = rf[k] ?? ((): number | null | undefined => { for (let i = rfKeys.length - 1; i >= 0; i--) if (rfKeys[i]! <= k) return rf[rfKeys[i]!]; return lastRf })()
    if (r == null) continue
    lastRf = r
    const rm = r / 100 / 12
    rows.push({ m: k, x: m.get(k)! - rm, y: a.get(k)! - rm })
  }
  const use = rows.slice(-months)
  if (use.length < 36) return null
  const g = regress(use.map((p) => p.x), use.map((p) => p.y))
  if (!g) return null
  const flags: string[] = []
  if (g.r2 < 0.15) flags.push('low_r2')
  if ((g.ci[1] - g.ci[0]) / 2 > 0.5) flags.push('wide_range')
  return { ...g, adjusted: blume(g.beta), months: use.length, from: use[0]!.m, to: use[use.length - 1]!.m, flags, points: use }
}

// ── Cost of capital ──────────────────────────────────────────────────────────────────────────────────────────────
// CAPM: required return on equity = risk-free + beta × market risk premium.
export const costOfEquity = (rf: number, beta: number, mrp: number) => rf + beta * mrp
// WACC from market values of equity and debt; interest is tax-deductible.
export function wacc(a: { equity: number; debt: number; re: number; rd: number; tax: number }): number {
  const v = a.equity + Math.max(0, a.debt)
  if (v <= 0) return a.re
  return (a.equity / v) * a.re + (Math.max(0, a.debt) / v) * a.rd * (1 - a.tax / 100)
}

// ── Cash flows ───────────────────────────────────────────────────────────────────────────────────────────────────
// Net present value; the first cash flow is today (not discounted).
export const npv = (rate: number, cfs: number[]) => cfs.reduce((s, c, t) => s + c / (1 + rate / 100) ** t, 0)
// Internal rate of return (percent) by bisection; null when the cash flows never change sign.
export function irr(cfs: number[]): number | null {
  let lo = -99, hi = 1000
  const f = (r: number) => npv(r, cfs)
  if (f(lo) * f(hi) > 0) return null
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid }
  return (lo + hi) / 2
}
// Probability-weighted value (probabilities in percent or as weights; they are scaled to add up to 1).
export function expectedValue(s: { p: number; v: number }[]): number {
  const tot = s.reduce((a, x) => a + x.p, 0)
  return tot ? s.reduce((a, x) => a + x.p * x.v, 0) / tot : NaN
}
// Present value of a terminal value received at the end of year n.
export const pvAt = (v: number, rate: number, n: number) => v / (1 + rate / 100) ** n

// ── Discounted cash flow ─────────────────────────────────────────────────────────────────────────────────────────
// Drivers, not hard numbers: revenue growth and operating (EBIT) margin per year, the tax rate, net investment (capital
// spending less depreciation) and working capital as a share of revenue, and the long-run growth after year 10.
export interface Drivers { growth: number[]; margin: number[]; tax: number; reinvest: number; nwc: number; terminal_growth: number }
export interface Base { revenue: number; ebit: number; nwc?: number | null }
export interface DcfRow { year: number; revenue: number; ebit: number; nopat: number; reinvest: number; nwc_change: number; fcf: number; pv: number }
export interface Dcf { rows: DcfRow[]; pv_fcf: number; tv: number; pv_tv: number; ev: number; tv_share: number; entry_ev_ebit: number | null; entry_ev_sales: number | null; exit_ev_ebit: number | null; exit_ev_sales: number | null; warnings: string[] }
export function dcf(base: Base, d: Drivers, waccPct: number, rfLong?: number): Dcf | null {
  const w = waccPct / 100, g = d.terminal_growth / 100
  if (!(base.revenue > 0) || !Number.isFinite(w)) return null
  if (d.terminal_growth > waccPct - 1) return null
  let rev = base.revenue, nwcPrev = base.nwc ?? (d.nwc / 100) * base.revenue
  const rows: DcfRow[] = []
  for (let t = 1; t <= 10; t++) {
    rev = rev * (1 + (d.growth[t - 1] ?? d.growth[d.growth.length - 1] ?? 0) / 100)
    const ebit = rev * (d.margin[t - 1] ?? d.margin[d.margin.length - 1] ?? 0) / 100
    const nopat = ebit * (1 - d.tax / 100), reinvest = rev * d.reinvest / 100, nwc = rev * d.nwc / 100, dn = nwc - nwcPrev
    nwcPrev = nwc
    const fcf = nopat - reinvest - dn
    rows.push({ year: t, revenue: rev, ebit, nopat, reinvest, nwc_change: dn, fcf, pv: fcf / (1 + w) ** t })
  }
  const last = rows[9]!, pvFcf = rows.reduce((a, r) => a + r.pv, 0)
  const tv = (last.fcf * (1 + g)) / (w - g), pvTv = tv / (1 + w) ** 10, ev = pvFcf + pvTv
  const warnings: string[] = []
  if (rfLong != null && d.terminal_growth > rfLong) warnings.push('Long-run growth is above the 10-year Treasury rate.')
  if (ev > 0 && pvTv / ev > 0.75) warnings.push('More than 75% of the value comes after year 10.')
  if (last.fcf <= 0) warnings.push('Free cash flow is still negative in year 10.')
  return { rows, pv_fcf: pvFcf, tv, pv_tv: pvTv, ev, tv_share: ev ? pvTv / ev : 0, entry_ev_ebit: base.ebit > 0 ? ev / base.ebit : null, entry_ev_sales: ev / base.revenue,
    exit_ev_ebit: last.ebit > 0 ? tv / (last.ebit * (1 + g)) : null, exit_ev_sales: tv / (last.revenue * (1 + g)), warnings }
}
export const perShare = (ev: number, netDebt: number, shares: number) => (shares > 0 ? (ev - netDebt) / shares : NaN)
// Dividend discount cross-check for steady payers: next year's dividend over (required return − growth).
export const ddm = (dps: number, re: number, g: number) => (re > g && dps > 0 ? (dps * (1 + g / 100)) / ((re - g) / 100) : null)

// Starting drivers from the company's own history (annual figures, oldest first): growth is the median of the last
// three years for years 1 to 3, fading in a straight line to long-run growth by year 10; margin, tax rate, net
// investment and working capital are the medians of the last three years. Each is kept within sensible bounds.
export interface History { revenue: number[]; ebit: number[]; tax_rate: number[]; reinvest: number[]; nwc: number[] }
export function seedDrivers(h: History, terminal = 2.5, taxDefault = 21): Drivers {
  const rev = h.revenue.filter((x) => x > 0)
  const gr: number[] = []
  for (let i = Math.max(1, rev.length - 3); i < rev.length; i++) gr.push((rev[i]! / rev[i - 1]! - 1) * 100)
  const g0 = clip(Number.isFinite(median(gr)) ? median(gr) : terminal, -10, 30)
  const growth = Array.from({ length: 10 }, (_, i) => r2(i < 3 ? g0 : g0 + ((terminal - g0) * (i - 2)) / 7, 2))
  const n = h.revenue.length, last3 = (xs: number[]) => xs.slice(-3)
  const margins = last3(h.ebit.map((e, i) => (h.revenue[i]! > 0 ? (e / h.revenue[i]!) * 100 : NaN)).slice(0, n))
  const m = clip(Number.isFinite(median(margins)) ? median(margins) : 10, -50, 70)
  const tax = Number.isFinite(median(last3(h.tax_rate))) ? clip(median(last3(h.tax_rate)), 10, 30) : taxDefault
  const ri = Number.isFinite(median(last3(h.reinvest))) ? clip(median(last3(h.reinvest)), 0, 30) : 3
  const nw = Number.isFinite(median(last3(h.nwc))) ? clip(median(last3(h.nwc)), -30, 50) : 0
  return { growth, margin: Array(10).fill(r2(m, 2)), tax: r2(tax, 2), reinvest: r2(ri, 2), nwc: r2(nw, 2), terminal_growth: terminal }
}

// ── What the price assumes, scenarios and sensitivity ────────────────────────────────────────────────────────────
export interface Valuer { base: Base; netDebt: number; shares: number; wacc: number; rfLong?: number }
export const valuePerShare = (v: Valuer, d: Drivers, waccPct = v.wacc): number | null => { const r = dcf(v.base, d, waccPct, v.rfLong); return r ? perShare(r.ev, v.netDebt, v.shares) : null }
// Bisection for f(x) = target on [lo, hi]; null when the target is outside the range.
function solve(f: (x: number) => number | null, target: number, lo: number, hi: number): number | null {
  let a = lo, b = hi, fa = f(a), fb = f(b)
  if (fa == null || fb == null || (fa - target) * (fb - target) > 0) return null
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2, fm = f(m)
    if (fm == null) return null
    if ((fa! - target) * (fm - target) <= 0) { b = m; fb = fm } else { a = m; fa = fm }
  }
  return (a + b) / 2
}
const shift = (d: Drivers, k: 'growth' | 'margin', by: number): Drivers => ({ ...d, [k]: d[k].map((x) => x + by) })
// Reverse DCF: the one revenue growth rate, every year for ten years, at today's margins, that gives today's price.
export function impliedGrowth(v: Valuer, d: Drivers, price: number): number | null {
  return solve((g) => valuePerShare(v, { ...d, growth: Array(10).fill(g) }), price, -25, 60)
}
export interface ScenarioSet { bear: { growth: number; margin: number; wacc: number }; bull: { growth: number; margin: number; wacc: number }; p: [number, number, number] }
export const DEFAULT_SCENARIOS: ScenarioSet = { bear: { growth: -3, margin: -2, wacc: 0.5 }, bull: { growth: 3, margin: 2, wacc: -0.5 }, p: [25, 50, 25] }
export function scenarios(v: Valuer, d: Drivers, s: ScenarioSet = DEFAULT_SCENARIOS) {
  const at = (x: { growth: number; margin: number; wacc: number }) => valuePerShare(v, shift(shift(d, 'growth', x.growth), 'margin', x.margin), v.wacc + x.wacc)
  const bear = at(s.bear), base = valuePerShare(v, d), bull = at(s.bull)
  const ok = bear != null && base != null && bull != null
  return { bear, base, bull, p: s.p, weighted: ok ? expectedValue([{ p: s.p[0], v: bear! }, { p: s.p[1], v: base! }, { p: s.p[2], v: bull! }]) : null }
}
// Each driver moved down and up by a set amount (in percentage points), ranked by how much the value moves, with the
// level at which the value would equal today's price (the break-even).
export function tornado(v: Valuer, d: Drivers, price: number) {
  const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
  const base = valuePerShare(v, d)
  const items = [
    { key: 'growth', label: 'Revenue growth', now: avg(d.growth), step: 3, at: (x: number) => valuePerShare(v, shift(d, 'growth', x - avg(d.growth))), lo: avg(d.growth) - 30, hi: avg(d.growth) + 30 },
    { key: 'margin', label: 'Operating margin', now: avg(d.margin), step: 2, at: (x: number) => valuePerShare(v, shift(d, 'margin', x - avg(d.margin))), lo: -40, hi: 90 },
    { key: 'wacc', label: 'Discount rate (WACC)', now: v.wacc, step: 1, at: (x: number) => valuePerShare(v, d, x), lo: d.terminal_growth + 1.01, hi: 40 },
    { key: 'terminal_growth', label: 'Long-run growth', now: d.terminal_growth, step: 0.5, at: (x: number) => valuePerShare(v, { ...d, terminal_growth: x }), lo: -5, hi: v.wacc - 1.01 },
    { key: 'reinvest', label: 'Net investment (% of revenue)', now: d.reinvest, step: 2, at: (x: number) => valuePerShare(v, { ...d, reinvest: x }), lo: -20, hi: 60 }]
  return items.map((it) => {
    const low = it.at(it.now - it.step), high = it.at(it.now + it.step)
    return { key: it.key, label: it.label, now: it.now, step: it.step, low, high, swing: low != null && high != null ? Math.abs(high - low) : 0, break_even: base == null ? null : solve(it.at, price, it.lo, it.hi) }
  }).sort((a, b) => b.swing - a.swing)
}

// ── Signal ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Margin of safety (how far the price is below the value) and the yearly return if the price reached the value over
// `years` while the business earned its cost of equity.
export const marginOfSafety = (fair: number, price: number) => ((fair - price) / price) * 100
export const expectedReturn = (fair: number, price: number, re: number, years = 3) => ((1 + re / 100) * (fair / price) ** (1 / years) - 1) * 100
export type Signal = 'strong_buy' | 'buy' | 'hold' | 'trim' | 'sell'
export const SIGNAL_LABEL: Record<Signal, string> = { strong_buy: 'Strong buy / Add', buy: 'Buy / Add', hold: 'Hold', trim: 'Trim', sell: 'Sell' }
export interface SignalRules { strong: number; buy: number; trim: number; sell: number; edge: number }
export const DEFAULT_SIGNAL: SignalRules = { strong: 25, buy: 10, trim: -10, sell: -25, edge: 4 }
export function signalOf(mos: number, er: number, re: number, dataOk: boolean, r: SignalRules = DEFAULT_SIGNAL): Signal {
  if (mos >= r.strong && er - re >= r.edge && dataOk) return 'strong_buy'
  if (mos >= r.buy) return 'buy'
  if (mos > r.trim) return 'hold'
  if (mos > r.sell) return 'trim'
  return 'sell'
}

// ── Risk (ETFs and crypto, and every stock) ──────────────────────────────────────────────────────────────────────
// Yearly volatility from the last `days` daily closes (log returns; 252 trading days, 365 for crypto).
export function volatility(px: Px[], days: number, perYear = 252): number | null {
  const c = [...px].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-(days + 1)).map((p) => p.close)
  if (c.length < Math.min(days, 20)) return null
  const r: number[] = []
  for (let i = 1; i < c.length; i++) r.push(Math.log(c[i]! / c[i - 1]!))
  const m = r.reduce((a, x) => a + x, 0) / r.length
  return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(perYear) * 100
}
// The largest fall from a high to a later low, in percent (negative).
export function maxDrawdown(px: Px[]): number | null {
  let peak = -Infinity, worst = 0
  for (const p of [...px].sort((a, b) => (a.d < b.d ? -1 : 1))) { peak = Math.max(peak, p.close); worst = Math.min(worst, p.close / peak - 1) }
  return px.length > 1 ? worst * 100 : null
}
