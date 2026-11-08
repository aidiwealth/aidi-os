// Charts placed in text (About the company, memos, updates, notes, governance…): worked out from the workspace's own
// figures and drawn as a list of shapes, which becomes an SVG for pages and emails, or is drawn straight into PDFs.
// Kinds: customer concentration (the largest customers against everyone else, this 12 months against the 12 before),
// any metric over time (Financials, customers and retention, the company's KPIs), and revenue by customer sector.
// Customer names appear only when the chart is set to show them; otherwise "Customer A", "Customer B".
import { addM, span, win } from '~/shared/customer-metrics'
import { shortAmount } from '~/shared/compact'

export type ChartSpec =
  | { kind: 'concentration'; top: number; names?: boolean; subject?: string; title?: string }
  | { kind: 'metric'; metrics: string[]; period: 'month' | 'quarter' | 'year'; count: number; style?: 'bar' | 'line'; subject?: string; title?: string }
  | { kind: 'sectors'; subject?: string; title?: string }

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
  const title = sp.title ?? d.series.map((x) => x.label).join(' and ')
  if (!d.labels.length || !d.series.some((x) => x.values.some((v) => v !== null))) return empty(title, 'No figures yet for this chart. Add them in Financials.')
  const unit = metricUnit(sp.metrics[0]!), cur = d.currency
  const fmt = (v: number) => (unit === 'pct' ? Math.round(v * 10) / 10 + '%' : unit === 'months' ? Math.round(v) + ' mo' : unit === 'number' ? Math.round(v).toLocaleString('en-US') : money(v, cur))
  const per = sp.period === 'year' ? 'Yearly' : sp.period === 'quarter' ? 'Quarterly' : 'Monthly'
  const first = d.series[0]!.values.find((v) => v !== null) ?? null, lastV = [...d.series[0]!.values].reverse().find((v) => v !== null) ?? null
  const growth = d.series.length === 1 && unit === 'money' && first && lastV && first > 0 ? ' · ' + pctS(((lastV - first) / first) * 100) + ' over the period' : ''
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
  return { w: W, h: plotTop + plotH + 40, shapes: sh, alt: title + ': ' + d.labels.map((l, i) => l + ' ' + d.series.map((s) => (s.values[i] === null ? '–' : fmt(s.values[i]!))).join(' / ')).join(', ') }
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

// The drawing for a chart, worked out for the subject it is set to (a company, or the group).
export async function chartDrawing(sp: ChartSpec): Promise<Drawing> {
  const subject: string = sp.subject ?? ((await currentOrg())?.kind === 'company' ? await companyEntityId().then((e) => (e ? 'entity:' + e : 'group')) : 'group')
  const run = async () => (sp.kind === 'concentration' ? concentration(sp) : sp.kind === 'sectors' ? sectors(sp) : metric({ ...sp, subject: sp.subject }))
  if (sp.kind === 'metric') return run()
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
