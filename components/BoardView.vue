<script setup lang="ts">
// Renders a board: KPI cards with change on the prior period, then charts drawn as line, bar, area, pie or table.
interface K { key: string; label: string; unit: string; value: number | null; prev: number | null; change: number | null }
type CT = 'line' | 'bar' | 'area' | 'pie' | 'table'
const props = defineProps<{ data: { labels: string[]; series: Record<string, (number | null)[]>; kpis: K[]; charts: { title: string; metrics: string[]; type?: CT }[]; currency: string; period: string }; metrics: Record<string, { label: string; unit: string }>; editable?: boolean }>()
const emit = defineEmits<{ type: [index: number, type: CT] }>()
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const unitOf = (k: string) => props.metrics[k]?.unit ?? 'money'
function fmt(v: number | null, unit: string, short = true) {
  if (v == null) return '—'
  if (unit === 'pct') return v.toFixed(1).replace(/\.0$/, '') + '%'
  if (unit === 'months') return v >= 99 ? '99+ mo' : v.toFixed(1).replace(/\.0$/, '') + ' mo'
  const s = SYM[props.data.currency] ?? props.data.currency + ' ', a = Math.abs(v)
  const t = !short ? a.toLocaleString('en-US', { maximumFractionDigits: 0 }) : a >= 1e9 ? (a / 1e9).toFixed(2) + 'bn' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'm' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : a.toFixed(0)
  return (v < 0 ? '−' : '') + s + t
}
const COLORS = ['#1c4f9c', '#3fa7d6', '#b5470b']
const TYPES: [CT, string][] = [['line', 'Line'], ['bar', 'Bar'], ['area', 'Area'], ['pie', 'Pie'], ['table', 'Table']]
const W = 560, H = 190, P = 28
function geo(metrics: string[]) {
  const vals = metrics.flatMap((m) => (props.data.series[m] ?? []).filter((v): v is number => v != null))
  const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals), n = props.data.labels.length
  const x = (i: number) => (n <= 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1)), y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P)
  const lines = metrics.map((m, j) => { const pts = (props.data.series[m] ?? []).map((v, i) => (v == null ? null : [x(i), y(v)] as [number, number])).filter(Boolean) as [number, number][]
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
    return { m, color: COLORS[j % 3]!, d, area: pts.length ? d + ' L' + pts[pts.length - 1]![0].toFixed(1) + ' ' + y(0).toFixed(1) + ' L' + pts[0]![0].toFixed(1) + ' ' + y(0).toFixed(1) + ' Z' : '', last: pts[pts.length - 1] } })
  const bw = Math.max(3, Math.min(26, ((W - 2 * P) / Math.max(1, n)) * 0.7 / metrics.length))
  const bars = metrics.flatMap((m, j) => (props.data.series[m] ?? []).map((v, i) => (v == null ? null : { k: m + i, x: x(i) - (bw * metrics.length) / 2 + j * bw, y: Math.min(y(v), y(0)), h: Math.max(1, Math.abs(y(v) - y(0))), color: COLORS[j % 3]! })).filter(Boolean)) as { k: string; x: number; y: number; h: number; color: string }[]
  return { lines, bars, bw, zero: y(0) }
}
const lastOf = (m: string) => [...(props.data.series[m] ?? [])].reverse().find((v) => v != null) ?? null
function pie(c: { metrics: string[] }) {
  if (c.metrics.length > 1) return c.metrics.map((m) => ({ label: props.metrics[m]?.label ?? m, value: Math.abs(lastOf(m) ?? 0) }))
  const m = c.metrics[0]!; const s = props.data.series[m] ?? []
  return props.data.labels.map((l, i) => ({ label: l, value: Math.abs(s[i] ?? 0) })).slice(-6)
}
const good = (k: K) => (k.change == null ? '' : (k.key === 'burn' || k.key === 'opex_total' ? k.change <= 0 : k.change >= 0) ? 'up' : 'down')
</script>
<template>
  <div class="bv">
    <div v-if="data.kpis.length" class="kp"><div v-for="k in data.kpis" :key="k.key" class="k"><em>{{ k.label }}</em><b>{{ fmt(k.value, k.unit) }}</b>
      <i v-if="k.change != null" :class="good(k)">{{ k.change > 0 ? '▲' : k.change < 0 ? '▼' : '' }} {{ k.unit === 'money' ? Math.abs(k.change) + '%' : (k.change > 0 ? '+' : '') + k.change + (k.unit === 'pct' ? ' pts' : ' mo') }} <span>vs prior {{ data.period }}</span></i><i v-else class="na">No prior {{ data.period }}</i></div></div>
    <div class="ch"><div v-for="(c, i) in data.charts" :key="i" class="card cc"><div class="ct"><b>{{ c.title }}</b>
        <span v-if="editable" class="tsw" role="group" aria-label="Chart type"><button v-for="[t, l] in TYPES" :key="t" type="button" :class="{ on: (c.type ?? 'line') === t }" :title="l" @click="emit('type', i, t)">{{ l }}</button></span>
        <span v-if="(c.type ?? 'line') !== 'pie' && (c.type ?? 'line') !== 'table'" class="lg"><span v-for="(m, j) in c.metrics" :key="m"><i :style="{ background: COLORS[j % 3] }" />{{ metrics[m]?.label ?? m }}</span></span></div>
      <template v-if="(c.type ?? 'line') === 'pie'"><DonutChart :title="c.metrics.length > 1 ? 'Latest ' + data.period : (metrics[c.metrics[0]!]?.label ?? '') + ' by ' + data.period" :segments="pie(c)" :currency="unitOf(c.metrics[0]!) === 'money' ? data.currency : ''" total-label="Total" /></template>
      <div v-else-if="c.type === 'table'" class="tw"><table><thead><tr><th>{{ data.period === 'month' ? 'Month' : data.period === 'quarter' ? 'Quarter' : 'Year' }}</th><th v-for="m in c.metrics" :key="m" class="n">{{ metrics[m]?.label ?? m }}</th></tr></thead>
        <tbody><tr v-for="(l, r) in data.labels.slice(-8).reverse()" :key="l"><td>{{ l }}</td><td v-for="m in c.metrics" :key="m" class="n">{{ fmt((data.series[m] ?? [])[data.labels.length - 1 - r] ?? null, unitOf(m), false) }}</td></tr></tbody></table></div>
      <template v-else><svg :viewBox="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" class="sv"><template v-for="g in [geo(c.metrics)]" :key="'g' + i"><line :x1="P" :x2="W - P" :y1="g.zero" :y2="g.zero" stroke="#e4e2dc" />
          <template v-if="c.type === 'bar'"><rect v-for="b in g.bars" :key="b.k" :x="b.x" :y="b.y" :width="g.bw - 1" :height="b.h" :fill="b.color" rx="1" /></template>
          <template v-else><template v-if="c.type === 'area'"><path v-for="l in g.lines" :key="'a' + l.m" :d="l.area" :fill="l.color" fill-opacity=".14" stroke="none" /></template>
            <path v-for="l in g.lines" :key="l.m" :d="l.d" fill="none" :stroke="l.color" stroke-width="2.4" stroke-linejoin="round" /><template v-for="l in g.lines" :key="'d' + l.m"><circle v-if="l.last" :cx="l.last[0]" :cy="l.last[1]" r="3.5" :fill="l.color" /></template></template></template></svg>
        <div class="ax"><span>{{ data.labels[0] }}</span><span>{{ c.metrics.map((m) => fmt(lastOf(m), unitOf(m))).join(' · ') }}</span><span>{{ data.labels[data.labels.length - 1] }}</span></div></template></div></div>
    <p v-if="!data.labels.length" class="mut">No figures yet. Add your monthly figures in Financials and the board fills in.</p>
  </div>
</template>
<style scoped>
.kp { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; } .k em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 26px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.k i { font-style: normal; font-size: 12.5px; font-weight: 500; } .k i span { color: var(--c-muted); font-weight: 400; } .k i.up { color: var(--c-ok); } .k i.down { color: var(--c-danger); } .k i.na { color: var(--c-muted); font-weight: 400; }
.ch { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 12px; margin-top: 12px; } .cc { display: flex; flex-direction: column; gap: 8px; } .ct { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; } .ct b { font-size: 15px; } .lg { display: flex; gap: 12px; font-size: 12px; color: var(--c-muted); width: 100%; } .lg span { display: flex; align-items: center; gap: 5px; } .lg i { width: 10px; height: 3px; display: inline-block; }
.tsw { display: flex; border: 1px solid var(--c-rule); } .tsw button { background: #fff; border: 0; padding: 3px 8px; font: inherit; font-size: 11.5px; cursor: pointer; color: var(--c-ink-soft); } .tsw button.on { background: var(--c-navy); color: #fff; }
.sv { width: 100%; height: 190px; } .ax { display: flex; justify-content: space-between; font-size: 12px; color: var(--c-muted); } .ax span:nth-child(2) { color: var(--c-ink); font-weight: 600; } .mut { color: var(--c-muted); font-size: 13.5px; }
.tw { overflow-x: auto; } .tw table { width: 100%; border-collapse: collapse; font-size: 13px; } .tw th { text-align: left; font-weight: 500; color: var(--c-muted); font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--c-rule); } .tw td { padding: 7px 8px; border-bottom: 1px solid var(--c-rule); } .tw .n { text-align: right; font-variant-numeric: tabular-nums; }
</style>
