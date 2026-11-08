// Charts placed in text (About the company, memos, updates, notes, governance…): worked out from the workspace's own
// figures and drawn as a list of shapes, which becomes an SVG for pages and emails, or is drawn straight into PDFs.
// Kinds: customer concentration (the largest customers against everyone else, this 12 months against the 12 before),
// any metric over time (Financials, customers and retention, the company's KPIs), and revenue by customer sector.
// Customer names appear only when the chart is set to show them; otherwise "Customer A", "Customer B".
import { addM, arrOf, groupOf, span, win, type Cust } from '~/shared/customer-metrics'
import { shortAmount } from '~/shared/compact'

export type ChartSpec =
  | { kind: 'concentration'; top: number; names?: boolean; subject?: string; title?: string }
  | { kind: 'metric'; metrics: string[]; period: 'month' | 'quarter' | 'year'; count: number; style?: 'bar' | 'line'; subject?: string; title?: string }
  | { kind: 'sectors'; subject?: string; title?: string }
  | { kind: 'bridge'; subject?: string; title?: string }
  | { kind: 'cohorts'; quarters: number; subject?: string; title?: string }
  | { kind: 'logos'; quarters: number; subject?: string; title?: string }
  | { kind: 'mix'; by: 'size' | 'segment'; quarters: number; subject?: string; title?: string }
  | { kind: 'top_trend'; quarters: number; subject?: string; title?: string }
  | { kind: 'arr' | 'traction'; quarters: number; subject?: string; title?: string }
  | { kind: 'distribution'; subject?: string; title?: string }

export type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { t: 'text'; x: number; y: number; s: string; size: number; bold?: boolean; fill: string; anchor?: 'start' | 'middle' | 'end' }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { t: 'poly'; pts: [number, number][]; stroke: string; width: number }
  | { t: 'dot'; x: number; y: number; r: number; fill: string }
export interface Drawing { w: number; h: number; shapes: Shape[]; alt: string }

const INK = '#111111', MUT = '#5f5f5f', RULE = '#cfcfc8', LAST = '#E3E3DE', NOW = '#C3C3BA', BLUE = '#3F76CF', RED = '#B42318'
const SERIES = ['#1C3D63', '#3F76CF', '#8AA4C4', '#2B5A8C', '#B9C9DC']
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€', KES: 'KSh ', GHS: 'GH₵', ZAR: 'R' }
const W = 760

export function cleanSpec(x: unknown): ChartSpec | null {
  const o = (x ?? {}) as Record<string, unknown>
  const subject = typeof o.subject === 'string' && /^(group|entity:[0-9a-f-]{36})$/.test(o.subject) ? o.subject : undefined
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 140) : undefined
  if (o.kind === 'concentration') return { kind: 'concentration', top: Math.min(5, Math.max(1, Math.round(Number(o.top) || 2))), names: o.names === true, subject, title }
  if (o.kind === 'sectors') return { kind: 'sectors', subject, title }
  const quarters = [4, 6, 8, 12].includes(Number(o.quarters)) ? Number(o.quarters) : 8
  if (o.kind === 'bridge') return { kind: 'bridge', subject, title }
  if (o.kind === 'cohorts' || o.kind === 'logos' || o.kind === 'top_trend' || o.kind === 'arr' || o.kind === 'traction') return { kind: o.kind, quarters, subject, title }
  if (o.kind === 'distribution') return { kind: 'distribution', subject, title }
  if (o.kind === 'mix') return { kind: 'mix', by: o.by === 'segment' ? 'segment' : 'size', quarters, subject, title }
  if (o.kind === 'metric') {
    const metrics = (Array.isArray(o.metrics) ? o.metrics : []).filter((k): k is string => typeof k === 'string' && isMetricKey(k)).slice(0, 4)
    if (!metrics.length) return null
    const period = o.period === 'quarter' || o.period === 'year' ? o.period : 'month'
    return { kind: 'metric', metrics, period, count: Math.min(36, Math.max(2, Math.round(Number(o.count) || 12))), style: o.style === 'line' ? 'line' : 'bar', subject, title }
  }
  return null
}

const money = (v: number, cur: string) => (v < 0 ? '-' : '') + shortAmount(Math.abs(v), SYM[cur] ?? cur + ' ')
const pctS = (v: number) => (v > 0 ? '+' : '') + (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + '%'
const ML = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
function empty(title: string, msg: string): Drawing {
  return { w: W, h: 150, alt: title, shapes: [{ t: 'text', x: 0, y: 30, s: title, size: 20, bold: true, fill: INK }, { t: 'rect', x: 0, y: 52, w: W, h: 80, fill: '#F4F3EF' }, { t: 'text', x: W / 2, y: 97, s: msg, size: 14, fill: MUT, anchor: 'middle' }] }
}
// Title, the line under it and a legend; returns where the plot can start.
function head(sh: Shape[], title: string, sub: string, legend: { label: string; fill: string }[]): number {
  sh.push({ t: 'text', x: 0, y: 30, s: cut(title, 70), size: 21, bold: true, fill: INK })
  let y = 30
  if (sub) { y += 28; sh.push({ t: 'text', x: 0, y, s: cut(sub, 100), size: 15, fill: MUT }) }
  if (legend.length) {
    y += 32; let x = 0
    for (const l of legend) { sh.push({ t: 'rect', x, y: y - 13, w: 16, h: 16, fill: l.fill }); sh.push({ t: 'text', x: x + 26, y, s: l.label, size: 15, fill: MUT }); x += 26 + l.label.length * 8.2 + 34 }
  }
  return y + 26
}

async function concentration(sp: Extract<ChartSpec, { kind: 'concentration' }>): Promise<Drawing> {
  const cs = await loadCustomers(), cur = (await customerConfig()).currency, s = span(cs)
  if (!s) return empty(sp.title ?? 'Customer concentration', 'No customer revenue yet. Add it on the Customers page.')
  const last = s.last, prior = addM(last, -12)
  const rows = cs.map((c) => ({ name: c.name, now: win(c, last, 12), then: win(c, prior, 12) })).filter((r) => r.now > 0 || r.then > 0)
  const top = [...rows].sort((a, b) => b.now - a.now).slice(0, sp.top), rest = rows.filter((r) => !top.includes(r))
  const tn = (k: 'now' | 'then') => rows.reduce((a, r) => a + r[k], 0)
  const othersNow = rest.reduce((a, r) => a + r.now, 0), othersThen = rest.reduce((a, r) => a + r.then, 0)
  const ch = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)
  const oc = ch(othersNow, othersThen), N = top.length
  const shareNow = tn('now') ? (top.reduce((a, r) => a + r.now, 0) / tn('now')) * 100 : 0, shareThen = tn('then') ? (top.reduce((a, r) => a + r.then, 0) / tn('then')) * 100 : 0
  const words = N === 1 ? 'our largest customer' : 'our ' + ['', '', 'two', 'three', 'four', 'five'][N] + ' largest customers'
  const title = sp.title ?? (oc === null ? 'Revenue outside ' + words : 'Revenue outside ' + words + (oc >= 0 ? ' grew ' : ' fell ') + Math.round(Math.abs(oc)) + '% in a year')
  const sub = (N === 1 ? 'Top customer: ' : 'Top ' + ['', '', 'two', 'three', 'four', 'five'][N] + ' customers: ') + Math.round(shareThen) + '% of revenue a year ago, ' + Math.round(shareNow) + '% now'
  const sh: Shape[] = []
  const top0 = head(sh, title, sub, [{ label: '12 months to ' + ML(prior), fill: LAST }, { label: '12 months to ' + ML(last), fill: NOW }])
  const groups = [...top.map((r, i) => ({ label: sp.names ? r.name : 'Customer ' + String.fromCharCode(65 + i), now: r.now, then: r.then, hi: false })), { label: 'All other customers', now: othersNow, then: othersThen, hi: true }]
  const plotTop = top0 + 40, base = plotTop + 230, max = Math.max(1, ...groups.flatMap((g) => [g.now, g.then]))
  const gw = W / groups.length, bw = Math.min(110, gw * 0.3)
  sh.push({ t: 'line', x1: 0, y1: base, x2: W, y2: base, stroke: RULE, width: 1 })
  groups.forEach((g, i) => {
    const cx = gw * i + gw / 2
    for (const [k, v] of [[0, g.then], [1, g.now]] as [number, number][]) {
      const h = Math.max(1, (Math.max(0, v) / max) * 220), x = k ? cx + 4 : cx - 4 - bw
      sh.push({ t: 'rect', x, y: base - h, w: bw, h, fill: k ? (g.hi ? BLUE : NOW) : LAST })
      sh.push({ t: 'text', x: x + bw / 2, y: base - h - 10, s: money(v, cur), size: 15, bold: k === 1, fill: k ? INK : MUT, anchor: 'middle' })
    }
    sh.push({ t: 'text', x: cx, y: base + 30, s: cut(g.label, 24), size: 16, fill: INK, anchor: 'middle' })
    const c = ch(g.now, g.then)
    if (c !== null) sh.push({ t: 'text', x: cx, y: base + 54, s: pctS(c), size: 15, bold: g.hi, fill: g.hi ? (c >= 0 ? BLUE : RED) : MUT, anchor: 'middle' })
  })
  return { w: W, h: base + 66, shapes: sh, alt: title + '. ' + sub + '.' }
}

async function metric(sp: Extract<ChartSpec, { kind: 'metric' }>): Promise<Drawing> {
  const d = await metricSeries(sp.metrics, sp.period, sp.count, sp.subject)
  // A period still running (2026 to September, a quarter part-way through) is named as such: amounts that add up
  // (revenue, transactions…) say "to Sep" and are not compared with full periods; levels (ARR, cash, customers) say
  // where they stand.
  const k0 = sp.metrics[0]!, adds = ['revenue', 'cogs', 'gross_profit', 'opex_total', 'ebitda', 'net_income', 'operating_cf'].includes(k0) || (k0.startsWith('kpi:') && kpiAdds(k0.slice(4)))
  const lastEnd = d.ends?.[d.ends.length - 1] ?? '', lm = Number(lastEnd.slice(5, 7)), mon = lastEnd ? ML(lastEnd).slice(0, 3) : ''
  const partial = !!lastEnd && sp.period !== 'month' && (sp.period === 'year' ? lm !== 12 : lm % 3 !== 0)
  if (partial) d.labels[d.labels.length - 1] = d.labels[d.labels.length - 1] + (adds ? ' (to ' + mon + ')' : ' (' + mon + ')')
  const simple = d.series.length === 1, sv = d.series[0]!.values, li = sv.length - 1, lv = sv[li] ?? null, pv = li > 0 ? sv[li - 1] ?? null : null
  const fmt0 = (v: number) => (metricUnit(k0) === 'pct' ? Math.round(v * 10) / 10 + '%' : metricUnit(k0) === 'months' ? Math.round(v) + ' months' : metricUnit(k0) === 'number' ? (Math.abs(v) >= 1e5 ? shortAmount(v, '') : Math.round(v).toLocaleString('en-US')) : money(v, d.currency))
  const lastLab = d.labels[li] ?? ''
  const autoTitle = simple && lv !== null ? d.series[0]!.label + ': ' + fmt0(lv) + ' in ' + lastLab.replace(/ \(.*\)$/, '') + (partial && adds ? ' so far' : pv && metricUnit(k0) !== 'pct' ? ', ' + (lv >= pv ? 'up ' : 'down ') + Math.round(Math.abs(((lv - pv) / Math.abs(pv)) * 100)) + '% on ' + d.labels[li - 1] : '') : d.series.map((x) => x.label).join(' and ')
  const title = sp.title ?? autoTitle
  if (!d.labels.length || !d.series.some((x) => x.values.some((v) => v !== null))) return empty(title, 'No figures yet for this chart. Add them in Financials.')
  const unit = metricUnit(sp.metrics[0]!), cur = d.currency
  const fmt = (v: number) => (unit === 'pct' ? Math.round(v * 10) / 10 + '%' : unit === 'months' ? Math.round(v) + ' mo' : unit === 'number' ? (Math.abs(v) >= 1e5 ? shortAmount(v, '') : Math.round(v).toLocaleString('en-US')) : money(v, cur))
  const per = sp.period === 'year' ? 'Yearly' : sp.period === 'quarter' ? 'Quarterly' : 'Monthly'
  const first = d.series[0]!.values.find((v) => v !== null) ?? null, lastV = [...d.series[0]!.values].reverse().find((v) => v !== null) ?? null
  const growth = ''; void first; void lastV
  const sh: Shape[] = []
  const top0 = head(sh, title, per + ', ' + d.labels[0] + ' to ' + d.labels[d.labels.length - 1] + (unit === 'money' ? ' · ' + cur : '') + growth, d.series.length > 1 ? d.series.map((x, i) => ({ label: x.label, fill: SERIES[i % SERIES.length]! })) : [])
  const vals = d.series.flatMap((x) => x.values.filter((v): v is number => v !== null))
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals), range = hi - lo || 1
  const plotTop = top0 + 30, plotH = 220, base = plotTop + plotH * (hi / range), y = (v: number) => plotTop + plotH * ((hi - v) / range)
  const n = d.labels.length, gw = W / n, line = sp.style === 'line' || unit === 'pct' || unit === 'months'
  const showVal = (i: number) => n <= 12 || i === n - 1 || i === 0 || i % Math.ceil(n / 6) === 0
  const showLab = (i: number) => n <= 12 || i % Math.ceil(n / 12) === 0 || i === n - 1
  sh.push({ t: 'line', x1: 0, y1: base, x2: W, y2: base, stroke: RULE, width: 1 })
  if (line) {
    d.series.forEach((s, si) => {
      const col = SERIES[si % SERIES.length]!, pts: [number, number][] = []
      s.values.forEach((v, i) => { if (v === null) return; pts.push([gw * i + gw / 2, y(v)]) })
      if (pts.length > 1) sh.push({ t: 'poly', pts, stroke: col, width: 2.5 })
      s.values.forEach((v, i) => { if (v === null) return; const cx = gw * i + gw / 2; sh.push({ t: 'dot', x: cx, y: y(v), r: 3.5, fill: col }); if (d.series.length === 1 && showVal(i)) sh.push({ t: 'text', x: cx, y: y(v) - 12, s: fmt(v), size: 13, bold: i === n - 1, fill: i === n - 1 ? INK : MUT, anchor: 'middle' }) })
    })
  } else {
    const k = d.series.length, bw = Math.min(64, (gw * 0.7) / k)
    d.series.forEach((s, si) => s.values.forEach((v, i) => {
      if (v === null) return
      const x = gw * i + gw / 2 - (bw * k) / 2 + bw * si, top = Math.min(y(v), base), h = Math.max(1, Math.abs(y(v) - base))
      const fill = k > 1 ? SERIES[si % SERIES.length]! : i === n - 1 ? BLUE : v < 0 ? '#D9A9A3' : NOW
      sh.push({ t: 'rect', x, y: top, w: bw - (k > 1 ? 2 : 0), h, fill })
      if (k === 1 && showVal(i)) sh.push({ t: 'text', x: x + bw / 2, y: v >= 0 ? top - 9 : top + h + 16, s: fmt(v), size: n > 12 ? 11.5 : 13, bold: i === n - 1, fill: i === n - 1 ? INK : MUT, anchor: 'middle' })
    }))
  }
  d.labels.forEach((l, i) => { if (showLab(i)) sh.push({ t: 'text', x: gw * i + gw / 2, y: plotTop + plotH + 28, s: l, size: n > 12 ? 11.5 : 13, fill: MUT, anchor: 'middle' }) })
  // Growth on the period before, under each label (not for a period still running when the amounts add up).
  const rowG = simple && n <= 12 && unit !== 'pct'
  if (rowG) sv.forEach((v, i) => { const p = i > 0 ? sv[i - 1] : null; if (v === null || !p || (i === li && partial && adds)) return; const g = ((v - p) / Math.abs(p)) * 100; sh.push({ t: 'text', x: gw * i + gw / 2, y: plotTop + plotH + 46, s: pctS(g), size: 11.5, fill: g >= 0 ? BLUE : RED, anchor: 'middle' }) })
  return { w: W, h: plotTop + plotH + (rowG ? 58 : 40), shapes: sh, alt: title + ': ' + d.labels.map((l, i) => l + ' ' + d.series.map((s) => (s.values[i] === null ? '–' : fmt(s.values[i]!))).join(' / ')).join(', ') }
}

async function sectors(sp: Extract<ChartSpec, { kind: 'sectors' }>): Promise<Drawing> {
  const d = await sectorShares(), title = sp.title ?? 'Revenue by customer sector'
  if (!d || !d.sectors.length) return empty(title, 'No customer data yet. Add it on the Customers page.')
  const sh: Shape[] = []
  const top0 = head(sh, title, 'Share of revenue over the 12 months to ' + ML(d.as_of), [])
  const max = Math.max(...d.sectors.map((x) => x.share), 1)
  d.sectors.forEach((x, i) => {
    const yy = top0 + 12 + i * 34, w = Math.max(2, (x.share / max) * 380)
    sh.push({ t: 'text', x: 0, y: yy + 16, s: cut(x.sector, 30), size: 15, fill: INK })
    sh.push({ t: 'rect', x: 270, y: yy, w, h: 22, fill: i === 0 ? BLUE : NOW })
    sh.push({ t: 'text', x: 270 + w + 10, y: yy + 16, s: x.share + '%', size: 15, bold: i === 0, fill: INK })
  })
  return { w: W, h: top0 + 12 + d.sectors.length * 34 + 6, shapes: sh, alt: title + ': ' + d.sectors.map((x) => x.sector + ' ' + x.share + '%').join(', ') }
}

// ---- Customer charts over time (quarters are three-month windows ending at the latest month with revenue) ----
type CustSpec = Extract<ChartSpec, { kind: 'bridge' | 'cohorts' | 'logos' | 'mix' | 'top_trend' | 'arr' | 'traction' | 'distribution' }>
const QL = (m: string) => { const mo = Number(m.slice(5, 7)); return mo % 3 === 0 ? 'Q' + mo / 3 + " '" + m.slice(2, 4) : ML(m).replace(/ (\d{2})(\d{2})$/, " '$2") }
const firstOf = (c: Cust) => Object.keys(c.rev).filter((m) => (c.rev[m] ?? 0) > 0).sort()[0] ?? null
// Stacked (or up-and-down) bars: one column per period, layers from the bottom; negatives go below the line.
function bars(sh: Shape[], top: number, labels: string[], layers: { label: string; fill: string; values: number[] }[], fmt: (v: number) => string, totals = true): number {
  const n = labels.length, gw = W / n, bw = Math.min(70, gw * 0.62), plotH = 220
  const up = labels.map((_, i) => layers.reduce((a, l) => a + Math.max(0, l.values[i] ?? 0), 0)), dn = labels.map((_, i) => layers.reduce((a, l) => a + Math.min(0, l.values[i] ?? 0), 0))
  const hi = Math.max(1, ...up), lo = Math.min(0, ...dn), range = hi - lo, base = top + plotH * (hi / range), k = plotH / range
  labels.forEach((lab, i) => {
    const x = gw * i + (gw - bw) / 2; let yu = base, yd = base
    for (const l of layers) { const v = l.values[i] ?? 0; if (!v) continue; const h = Math.abs(v) * k; if (v > 0) { yu -= h; sh.push({ t: 'rect', x, y: yu, w: bw, h: Math.max(0.5, h), fill: l.fill }) } else { sh.push({ t: 'rect', x, y: yd, w: bw, h: Math.max(0.5, h), fill: l.fill }); yd += h } }
    if (totals && up[i]) sh.push({ t: 'text', x: x + bw / 2, y: yu - 9, s: fmt(up[i]!), size: n > 8 ? 11.5 : 13, bold: i === n - 1, fill: i === n - 1 ? INK : MUT, anchor: 'middle' })
    if (dn[i]) sh.push({ t: 'text', x: x + bw / 2, y: yd + 16, s: fmt(dn[i]!), size: n > 8 ? 11.5 : 13, fill: MUT, anchor: 'middle' })
    sh.push({ t: 'text', x: gw * i + gw / 2, y: top + plotH + 30, s: lab, size: n > 8 ? 11.5 : 13, fill: MUT, anchor: 'middle' })
  })
  sh.push({ t: 'line', x1: 0, y1: base, x2: W, y2: base, stroke: RULE, width: 1 })
  return top + plotH + 42
}
async function customerChart(sp: CustSpec): Promise<Drawing> {
  const NAME: Record<CustSpec['kind'], string> = { bridge: 'Revenue bridge', cohorts: 'Revenue by customer start year', logos: 'Customers won and lost', mix: 'Revenue by customer group', top_trend: 'Revenue from the largest customers', arr: 'Annual recurring revenue', traction: 'Paying customers', distribution: 'Customers by annual revenue' }
  const cs = await loadCustomers(), cfg = await customerConfig(), cur = cfg.currency, s = span(cs)
  if (!s) return empty(sp.title ?? NAME[sp.kind], 'No customer revenue yet. Add it on the Customers page.')
  const last = s.last, sh: Shape[] = [], m$ = (v: number) => money(v, cur)
  const q = 'quarters' in sp ? sp.quarters : 8, ends = Array.from({ length: q }, (_, i) => addM(last, -3 * (q - 1 - i))).filter((m) => m >= addM(s.first, 2)), labels = ends.map(QL)
  const sum = (m: string, f: (c: Cust) => boolean = () => true) => cs.reduce((a, c) => a + (f(c) ? win(c, m, 3) : 0), 0)

  if (sp.kind === 'bridge') {
    // Last year's revenue to this year's: customers won, growth and shrinkage of those who stayed, those who left.
    const prior = addM(last, -12)
    let start = 0, won = 0, grew = 0, shrank = 0, lost = 0, end = 0
    for (const c of cs) { const a = win(c, prior, 12), b = win(c, last, 12); start += a; end += b; if (a <= 0 && b > 0) won += b; else if (a > 0 && b <= 0) lost += a; else if (b > a) grew += b - a; else shrank += a - b }
    if (!start && !end) return empty(sp.title ?? NAME.bridge, 'Not enough customer revenue for a year-on-year bridge yet.')
    const ch = start ? ((end - start) / start) * 100 : null
    const title = sp.title ?? (ch === null ? 'Where this year\'s revenue came from' : 'Revenue ' + (ch >= 0 ? 'up ' : 'down ') + Math.round(Math.abs(ch)) + '% in a year: ' + m$(won) + ' from new customers')
    const top0 = head(sh, title, '12 months to ' + ML(prior) + ' against 12 months to ' + ML(last) + ' · ' + cur, [])
    const steps = [{ l: '12 months to ' + ML(prior).slice(0, 3) + " '" + prior.slice(2, 4), v: start, kind: 'total' }, { l: 'New customers', v: won, kind: 'up' }, { l: 'Customers who grew', v: grew, kind: 'up' }, { l: 'Customers who shrank', v: -shrank, kind: 'down' }, { l: 'Customers who left', v: -lost, kind: 'down' }, { l: '12 months to ' + ML(last).slice(0, 3) + " '" + last.slice(2, 4), v: end, kind: 'end' }]
    const plotTop = top0 + 30, plotH = 230, hi = Math.max(start, end, start + won + grew), k = plotH / Math.max(1, hi), base = plotTop + plotH, gw = W / steps.length, bw = Math.min(90, gw * 0.62)
    let run = 0
    steps.forEach((st, i) => {
      const x = gw * i + (gw - bw) / 2
      let y0: number, y1: number
      if (st.kind === 'total' || st.kind === 'end') { y0 = base - st.v * k; y1 = base; run = st.v } else { const from = run; run += st.v; y0 = base - Math.max(from, run) * k; y1 = base - Math.min(from, run) * k }
      sh.push({ t: 'rect', x, y: y0, w: bw, h: Math.max(1, y1 - y0), fill: st.kind === 'end' ? BLUE : st.kind === 'total' ? NOW : st.kind === 'up' ? '#1C3D63' : '#D9A9A3' })
      sh.push({ t: 'text', x: x + bw / 2, y: y0 - 9, s: (st.kind === 'up' ? '+' : '') + m$(st.v), size: 14, bold: st.kind === 'end', fill: st.kind === 'down' ? RED : INK, anchor: 'middle' })
      if (i < steps.length - 1) sh.push({ t: 'line', x1: x + bw, y1: base - run * k, x2: x + gw, y2: base - run * k, stroke: RULE, width: 1 })
      const words = st.l.split(' '), mid = Math.ceil(words.length / 2)
      sh.push({ t: 'text', x: x + bw / 2, y: base + 24, s: words.slice(0, mid).join(' '), size: 13, fill: INK, anchor: 'middle' })
      sh.push({ t: 'text', x: x + bw / 2, y: base + 42, s: words.slice(mid).join(' '), size: 13, fill: INK, anchor: 'middle' })
    })
    sh.push({ t: 'line', x1: 0, y1: base, x2: W, y2: base, stroke: RULE, width: 1 })
    return { w: W, h: base + 52, shapes: sh, alt: title + '. Start ' + m$(start) + ', new ' + m$(won) + ', grew ' + m$(grew) + ', shrank ' + m$(shrank) + ', left ' + m$(lost) + ', end ' + m$(end) + '.' }
  }

  if (sp.kind === 'cohorts') {
    // Each quarter's revenue split by the year the customer first paid (the "layer cake").
    const years = [...new Set(cs.map(firstOf).filter((m): m is string => !!m).map((m) => m.slice(0, 4)))].sort()
    const keep = years.slice(-5), older = years.slice(0, -5), PAL = ['#0C1A2E', '#1C3D63', '#5E7FA6', '#A9BBD1', '#D5DEEA', '#E8EDF3']
    const groups = [...(older.length ? [{ label: 'Before ' + keep[0], f: (y: string) => older.includes(y) }] : []), ...keep.map((y) => ({ label: y, f: (x: string) => x === y }))]
    // Oldest darkest, then lighter; the latest year in blue.
    const layers = groups.map((g, i) => ({ label: g.label, fill: i === groups.length - 1 ? BLUE : PAL[Math.min(i, PAL.length - 1)]!, values: ends.map((m) => sum(m, (c) => { const f = firstOf(c); return !!f && g.f(f.slice(0, 4)) })) }))
    const tot = layers.reduce((a, l) => a + (l.values[l.values.length - 1] ?? 0), 0), thisYear = last.slice(0, 4)
    const oldShare = tot ? (layers.filter((l) => l.label !== thisYear).reduce((a, l) => a + (l.values[l.values.length - 1] ?? 0), 0) / tot) * 100 : 0
    const title = sp.title ?? Math.round(oldShare) + '% of revenue in ' + labels[labels.length - 1] + ' came from customers won before ' + thisYear
    const top0 = head(sh, title, 'Quarterly revenue by the year each customer first paid · ' + cur, layers.map((l) => ({ label: l.label, fill: l.fill })))
    const h = bars(sh, top0 + 30, labels, layers, m$)
    return { w: W, h, shapes: sh, alt: title + '. ' + labels.map((l, i) => l + ': ' + layers.map((x) => x.label + ' ' + m$(x.values[i] ?? 0)).join(', ')).join('; ') }
  }

  if (sp.kind === 'logos') {
    // Customers who paid for the first time in each quarter, and those who stopped (nothing for a full quarter after paying the one before).
    const won = ends.map((m) => cs.filter((c) => { const f = firstOf(c); return !!f && f > addM(m, -3) && f <= m }).length)
    const lost = ends.map((m) => -cs.filter((c) => win(c, addM(m, -3), 3) > 0 && win(c, m, 3) <= 0).length)
    const active = ends.map((m) => cs.filter((c) => win(c, m, 3) > 0).length)
    const w4 = won.slice(-4).reduce((a, b) => a + b, 0), l4 = -lost.slice(-4).reduce((a, b) => a + b, 0)
    const title = sp.title ?? w4 + ' customers won and ' + l4 + ' lost in the last four quarters'
    const top0 = head(sh, title, 'New paying customers and customers who stopped paying, by quarter · ' + active[active.length - 1] + ' paying now', [{ label: 'Won', fill: '#1C3D63' }, { label: 'Lost', fill: '#D9A9A3' }])
    const h = bars(sh, top0 + 30, labels, [{ label: 'Won', fill: '#1C3D63', values: won }, { label: 'Lost', fill: '#D9A9A3', values: lost }], (v) => String(Math.round(Math.abs(v))))
    return { w: W, h, shapes: sh, alt: title + '. ' + labels.map((l, i) => l + ': won ' + won[i] + ', lost ' + -lost[i]!).join('; ') }
  }

  if (sp.kind === 'mix') {
    // Revenue by customer group (size band from run-rate, or the segment recorded on each customer), by quarter.
    const t = { enterprise: cfg.enterprise_arr, midmarket: cfg.midmarket_arr }
    const names = new Map<string, number>(); for (const c of cs) { const g = groupOf(c, sp.by, last, t); names.set(g, (names.get(g) ?? 0) + win(c, last, 12)) }
    const order = sp.by === 'size' ? ['Enterprise', 'Mid-market', 'SMB'].filter((g) => names.has(g)) : [...names.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
    const shown = order.slice(0, 5), PAL = ['#1C3D63', BLUE, '#8AA4C4', '#C3C3BA', '#DCE5EF', '#E3E3DE']
    const layers = [...shown.map((g, i) => ({ label: g, fill: PAL[i]!, values: ends.map((m) => sum(m, (c) => groupOf(c, sp.by, m, t) === g)) })),
      ...(order.length > 5 ? [{ label: 'Other', fill: PAL[5]!, values: ends.map((m) => sum(m, (c) => !shown.includes(groupOf(c, sp.by, m, t)))) }] : [])]
    const lastTot = layers.reduce((a, l) => a + (l.values[l.values.length - 1] ?? 0), 0), lead = layers[0]
    const title = sp.title ?? (lead && lastTot ? lead.label + ' customers: ' + Math.round(((lead.values[lead.values.length - 1] ?? 0) / lastTot) * 100) + '% of revenue in ' + labels[labels.length - 1] : 'Revenue by customer group')
    const top0 = head(sh, title, 'Quarterly revenue by ' + (sp.by === 'size' ? 'customer size (annual run-rate)' : 'customer segment') + ' · ' + cur, layers.map((l) => ({ label: l.label, fill: l.fill })))
    const h = bars(sh, top0 + 30, labels, layers, m$)
    return { w: W, h, shapes: sh, alt: title + '. ' + labels.map((l, i) => l + ': ' + layers.map((x) => x.label + ' ' + m$(x.values[i] ?? 0)).join(', ')).join('; ') }
  }

  if (sp.kind === 'arr' || sp.kind === 'traction') {
    // ARR: each quarter end's run-rate (the last three months' revenue × 4). Traction: customers paying in the quarter.
    const vals = ends.map((m) => (sp.kind === 'arr' ? cs.reduce((a, c) => a + arrOf(c, m), 0) : cs.filter((c) => win(c, m, 3) > 0).length))
    const fmt = (v: number) => (sp.kind === 'arr' ? m$(v) : Math.round(v).toLocaleString('en-US'))
    const now = vals[vals.length - 1] ?? 0, yearAgo = vals.length > 4 ? vals[vals.length - 5]! : vals[0] ?? 0, ch = yearAgo ? ((now - yearAgo) / yearAgo) * 100 : null
    const span4 = vals.length > 4 ? 'in a year' : 'since ' + labels[0]
    const title = sp.title ?? (sp.kind === 'arr' ? 'ARR ' + fmt(now) + (ch === null ? '' : ', ' + (ch >= 0 ? 'up ' : 'down ') + Math.round(Math.abs(ch)) + '% ' + span4) : fmt(now) + ' paying customers' + (ch === null ? '' : ', ' + (ch >= 0 ? 'up ' : 'down ') + Math.round(Math.abs(ch)) + '% ' + span4))
    const sub = sp.kind === 'arr' ? 'Annual recurring revenue at each quarter end: the last three months\' revenue × 4 · ' + cur : 'Customers who paid in each quarter'
    const top0 = head(sh, title, sub, [])
    const plotTop = top0 + 30, plotH = 220, hi = Math.max(1, ...vals), n = vals.length, gw = W / n, bw = Math.min(70, gw * 0.62), base = plotTop + plotH
    vals.forEach((v, i) => {
      const h = Math.max(1, (v / hi) * plotH), x = gw * i + (gw - bw) / 2
      sh.push({ t: 'rect', x, y: base - h, w: bw, h, fill: i === n - 1 ? BLUE : NOW })
      sh.push({ t: 'text', x: x + bw / 2, y: base - h - 9, s: fmt(v), size: n > 8 ? 11.5 : 13, bold: i === n - 1, fill: i === n - 1 ? INK : MUT, anchor: 'middle' })
      sh.push({ t: 'text', x: gw * i + gw / 2, y: base + 28, s: labels[i]!, size: n > 8 ? 11.5 : 13, fill: MUT, anchor: 'middle' })
      if (i > 0 && vals[i - 1]) { const g = ((v - vals[i - 1]!) / vals[i - 1]!) * 100; sh.push({ t: 'text', x: gw * i + gw / 2, y: base + 46, s: pctS(g), size: 11.5, fill: g >= 0 ? BLUE : RED, anchor: 'middle' }) }
    })
    sh.push({ t: 'line', x1: 0, y1: base, x2: W, y2: base, stroke: RULE, width: 1 })
    return { w: W, h: base + 56, shapes: sh, alt: title + '. ' + labels.map((l, i) => l + ' ' + fmt(vals[i]!)).join(', ') }
  }

  if (sp.kind === 'distribution') {
    // Customers by what they paid in the last 12 months: share of customers against share of revenue in each band.
    const ttm = cs.map((c) => win(c, last, 12)).filter((v) => v > 0), tot = ttm.reduce((a, b) => a + b, 0)
    if (!ttm.length) return empty(sp.title ?? NAME.distribution, 'No customer revenue in the last 12 months.')
    const sym = SYM[cur] ?? cur + ' ', big = Math.max(...ttm), steps = [0, 1e3, 1e4, 5e4, 1e5, 5e5, 1e6, 5e6, 1e7, 1e8, 1e9, 1e10]
    let edges = steps.filter((e) => e < big); if (edges.length > 7) edges = edges.slice(edges.length - 7); edges[0] = 0
    const k = (v: number) => sym + (v >= 1e9 ? v / 1e9 + 'B' : v >= 1e6 ? v / 1e6 + 'M' : v >= 1e3 ? v / 1e3 + 'k' : String(v))
    const lab = (a: number, b?: number) => (b === undefined ? k(a) + '+' : a === 0 ? 'Under ' + k(b) : k(a) + '–' + k(b))
    const bands = edges.map((e, i) => { const nx = edges[i + 1]; const inB = ttm.filter((v) => v >= e && (nx === undefined || v < nx)); return { label: lab(e, nx), n: inB.length, rev: inB.reduce((a, b) => a + b, 0) } }).filter((b) => b.n > 0)
    const topB = bands[bands.length - 1]!, cPct = (topB.n / ttm.length) * 100, rPct = tot ? (topB.rev / tot) * 100 : 0
    const title = sp.title ?? (cPct < 1 ? Math.round(cPct * 10) / 10 : Math.round(cPct)) + '% of customers bring ' + Math.round(rPct) + '% of revenue'
    const top0 = head(sh, title, ttm.length.toLocaleString('en-US') + ' customers by what they paid in the 12 months to ' + ML(last) + ' · ' + cur, [{ label: 'Share of customers', fill: NOW }, { label: 'Share of revenue', fill: BLUE }])
    const plotTop = top0 + 30, plotH = 220, base = plotTop + plotH, n = bands.length, gw = W / n, bw = Math.min(56, gw * 0.3)
    bands.forEach((b, i) => {
      const cx = gw * i + gw / 2
      for (const [k, v] of [[0, (b.n / ttm.length) * 100], [1, tot ? (b.rev / tot) * 100 : 0]] as [number, number][]) {
        const h = Math.max(1, (v / 100) * plotH), x = k ? cx + 3 : cx - 3 - bw
        sh.push({ t: 'rect', x, y: base - h, w: bw, h, fill: k ? BLUE : NOW })
        sh.push({ t: 'text', x: x + bw / 2, y: base - h - 8, s: (v < 1 && v > 0 ? Math.round(v * 10) / 10 : Math.round(v)) + '%', size: 12.5, bold: k === 1, fill: k ? INK : MUT, anchor: 'middle' })
      }
      sh.push({ t: 'text', x: cx, y: base + 26, s: b.label, size: 13, fill: INK, anchor: 'middle' })
      sh.push({ t: 'text', x: cx, y: base + 44, s: b.n.toLocaleString('en-US') + (b.n === 1 ? ' customer' : ' customers'), size: 12, fill: MUT, anchor: 'middle' })
    })
    sh.push({ t: 'line', x1: 0, y1: base, x2: W, y2: base, stroke: RULE, width: 1 })
    return { w: W, h: base + 54, shapes: sh, alt: title + '. ' + bands.map((b) => b.label + ': ' + b.n + ' customers, ' + (tot ? Math.round((b.rev / tot) * 100) : 0) + '% of revenue').join('; ') }
  }

  // top_trend: share of the last 12 months' revenue from the largest 1, 5 and 10 customers, at each quarter end.
  const share = (m: string, n: number) => { const v = cs.map((c) => win(c, m, 12)).filter((x) => x > 0).sort((a, b) => b - a), tot = v.reduce((a, b) => a + b, 0); return tot ? (v.slice(0, n).reduce((a, b) => a + b, 0) / tot) * 100 : null }
  const series = [1, 5, 10].map((n, i) => ({ label: n === 1 ? 'Largest customer' : 'Top ' + n, fill: SERIES[i]!, values: ends.map((m) => share(m, n)) }))
  const t10 = series[2]!.values, a = t10.find((v) => v !== null) ?? null, b = t10[t10.length - 1] ?? null
  const title = sp.title ?? (a !== null && b !== null ? 'Top 10 customers: ' + Math.round(b) + '% of revenue, ' + (b < a - 0.5 ? 'down from ' : b > a + 0.5 ? 'up from ' : 'about the same as ') + Math.round(a) + '%' : NAME.top_trend)
  const top0 = head(sh, title, 'Share of the last 12 months\' revenue, at each quarter end', series.map((x) => ({ label: x.label, fill: x.fill })))
  const plotTop = top0 + 30, plotH = 220, n = labels.length, gw = W / n, y = (v: number) => plotTop + plotH * (1 - v / 100)
  for (const g of [0, 25, 50, 75, 100]) { sh.push({ t: 'line', x1: 0, y1: y(g), x2: W, y2: y(g), stroke: g ? '#EEEEE9' : RULE, width: 1 }); if (g) sh.push({ t: 'text', x: 0, y: y(g) - 5, s: g + '%', size: 11, fill: MUT }) }
  for (const x of series) {
    const pts: [number, number][] = []; x.values.forEach((v, i) => { if (v !== null) pts.push([gw * i + gw / 2, y(v)]) })
    if (pts.length > 1) sh.push({ t: 'poly', pts, stroke: x.fill, width: 2.5 })
    x.values.forEach((v, i) => { if (v === null) return; sh.push({ t: 'dot', x: gw * i + gw / 2, y: y(v), r: 3.5, fill: x.fill }); if (i === n - 1) sh.push({ t: 'text', x: gw * i + gw / 2, y: y(v) - 10, s: Math.round(v) + '%', size: 13, bold: true, fill: INK, anchor: 'middle' }) })
  }
  labels.forEach((l, i) => sh.push({ t: 'text', x: gw * i + gw / 2, y: plotTop + plotH + 28, s: l, size: n > 8 ? 11.5 : 13, fill: MUT, anchor: 'middle' }))
  return { w: W, h: plotTop + plotH + 40, shapes: sh, alt: title + '. ' + labels.map((l, i) => l + ': ' + series.map((x) => x.label + ' ' + (x.values[i] === null ? '–' : Math.round(x.values[i]!) + '%')).join(', ')).join('; ') }
}

// The drawing for a chart, worked out for the subject it is set to (a company, or the group).
export async function chartDrawing(sp: ChartSpec): Promise<Drawing> {
  const subject: string = sp.subject ?? ((await currentOrg())?.kind === 'company' ? await companyEntityId().then((e) => (e ? 'entity:' + e : 'group')) : 'group')
  const run = async () => (sp.kind === 'concentration' ? concentration(sp) : sp.kind === 'sectors' ? sectors(sp) : sp.kind === 'metric' ? metric(sp) : customerChart(sp))
  if (sp.kind === 'metric' && !sp.metrics.some(isCustKey)) return run()
  return (await withCustFor(subject, run)) ?? empty(sp.title ?? 'Customers', 'No customer data for this company.')
}

const escX = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function drawingSvg(d: Drawing): string {
  const pad = 20, out: string[] = []
  for (const s of d.shapes) {
    if (s.t === 'rect') out.push('<rect x="' + (s.x + pad).toFixed(1) + '" y="' + (s.y + pad).toFixed(1) + '" width="' + s.w.toFixed(1) + '" height="' + s.h.toFixed(1) + '" fill="' + s.fill + '"/>')
    else if (s.t === 'text') out.push('<text x="' + (s.x + pad).toFixed(1) + '" y="' + (s.y + pad).toFixed(1) + '" font-size="' + s.size + '"' + (s.bold ? ' font-weight="600"' : '') + ' fill="' + s.fill + '"' + (s.anchor && s.anchor !== 'start' ? ' text-anchor="' + s.anchor + '"' : '') + '>' + escX(s.s) + '</text>')
    else if (s.t === 'line') out.push('<line x1="' + (s.x1 + pad) + '" y1="' + (s.y1 + pad).toFixed(1) + '" x2="' + (s.x2 + pad) + '" y2="' + (s.y2 + pad).toFixed(1) + '" stroke="' + s.stroke + '" stroke-width="' + s.width + '"/>')
    else if (s.t === 'poly') out.push('<polyline fill="none" stroke="' + s.stroke + '" stroke-width="' + s.width + '" stroke-linejoin="round" points="' + s.pts.map(([x, y]) => (x + pad).toFixed(1) + ',' + (y + pad).toFixed(1)).join(' ') + '"/>')
    else out.push('<circle cx="' + (s.x + pad).toFixed(1) + '" cy="' + (s.y + pad).toFixed(1) + '" r="' + s.r + '" fill="' + s.fill + '"/>')
  }
  const w = d.w + pad * 2, h = d.h + pad * 2
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + escX(d.alt) + '" font-family="Instrument Sans, Helvetica Neue, Helvetica, Arial, sans-serif"><title>' + escX(d.alt) + '</title><rect width="100%" height="100%" fill="#ffffff"/>' + out.join('') + '</svg>'
}

// A chart by id, for whoever is showing it (a page, an email, a PDF): the saved picture when frozen, else worked out
// now in the chart's own workspace. Returns null when there is no such chart.
export async function chartById(id: string): Promise<{ svg: string; drawing: Drawing | null; frozen: boolean } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const row = (await asPlatform(() => db().query<{ organization_id: string; spec: unknown; svg: string | null; frozen_at: string | null }>('SELECT organization_id, spec, svg, frozen_at FROM core.inline_charts WHERE id = $1', [id]))).rows[0]
  if (!row) return null
  const spec = cleanSpec(row.spec)
  if (row.frozen_at && row.svg) return { svg: row.svg, drawing: (row.spec as { drawing?: Drawing }).drawing ?? null, frozen: true }
  if (!spec) return null
  const e = useEvent(), was = e.context.orgId, cacheKey = 'org:' + String(row.organization_id)
  e.context.orgId = row.organization_id; delete e.context[cacheKey]
  try { const d = await chartDrawing(spec); return { svg: drawingSvg(d), drawing: d, frozen: false } } finally { e.context.orgId = was }
}
// Charts in a piece of Markdown text (by their links).
export const CHART_LINK = /\/api\/public\/charts\/([0-9a-f-]{36})\.svg/g
export async function freezeChartsIn(md: string): Promise<number> {
  const ids = [...new Set([...md.matchAll(CHART_LINK)].map((m) => m[1]!))]
  let n = 0
  for (const id of ids) {
    const row = (await db().query<{ spec: unknown; frozen_at: string | null }>('SELECT spec, frozen_at FROM core.inline_charts WHERE id = $1', [id])).rows[0]
    const spec = row && !row.frozen_at ? cleanSpec(row.spec) : null
    if (!spec) continue
    const d = await chartDrawing(spec)
    await db().query("UPDATE core.inline_charts SET svg = $2, spec = spec || jsonb_build_object('drawing', $3::jsonb), frozen_at = now(), updated_at = now() WHERE id = $1", [id, drawingSvg(d), JSON.stringify(d)])
    n++
  }
  return n
}
