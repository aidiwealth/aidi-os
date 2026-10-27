<script setup lang="ts">
// A price (or any value) over time as a line with a soft area under it, in plain SVG. Hover or touch to read the date and
// value at any point; optional dashed reference lines (for example the fair value) and a shaded band (bear to bull).
import { usd, fixed } from '~/shared/market-format'
const props = withDefaults(defineProps<{ points: { t: string; v: number }[]; unit?: 'usd' | 'pct'; height?: number; refs?: { v: number; label: string }[]; band?: [number, number] | null; base?: number | null; label?: string; dates?: 'time' | 'day' }>(), { unit: 'usd', height: 240, refs: () => [], band: null, base: null, label: 'Price', dates: 'day' })
const W = 800, PADT = 16, PADB = 24
const H = computed(() => props.height)
// The scale follows the prices; a reference line or the baseline widens it only when close (within half the price
// range), so a far-off fair value does not flatten the chart. The band is drawn clipped to the chart.
const pv = computed(() => props.points.map((p) => p.v))
const vals = computed(() => { const a = Math.min(...pv.value), b = Math.max(...pv.value), span = (b - a) || Math.abs(b) * 0.1 || 1; return [...pv.value, ...[...props.refs.map((r) => r.v), ...(props.base != null ? [props.base] : [])].filter((v) => v >= a - span * 0.5 && v <= b + span * 0.5)].filter(Number.isFinite) })
const inView = (v: number) => v >= lo.value && v <= hi.value
const lo = computed(() => { const a = Math.min(...vals.value), b = Math.max(...vals.value); return a - (b - a) * 0.08 })
const hi = computed(() => { const a = Math.min(...vals.value), b = Math.max(...vals.value); return b + (b - a) * 0.08 || b + 1 })
const x = (i: number) => (props.points.length > 1 ? (i / (props.points.length - 1)) * W : W / 2)
const y = (v: number) => PADT + ((hi.value - v) / (hi.value - lo.value || 1)) * (H.value - PADT - PADB)
const line = computed(() => props.points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' '))
const area = computed(() => (props.points.length > 1 ? line.value + ' L' + W + ' ' + (H.value - PADB) + ' L0 ' + (H.value - PADB) + ' Z' : ''))
const up = computed(() => { const f = props.base ?? props.points[0]?.v, l = props.points[props.points.length - 1]?.v; return f == null || l == null || l >= f })
const fmt = (v: number) => (props.unit === 'pct' ? fixed(v, 1) + '%' : usd(v))
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function when(t: string) {
  if (props.dates === 'time' && t.length > 10) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(t)).map((q) => [q.type, q.value])); const h = Number(p.hour) % 24; return Number(p.day) + ' ' + MON[Number(p.month) - 1] + ', ' + (h % 12 || 12) + ':' + String(p.minute).padStart(2, '0') + (h < 12 ? ' AM' : ' PM') + ' ET' }
  return Number(t.slice(8, 10)) + ' ' + MON[Number(t.slice(5, 7)) - 1] + ' ' + t.slice(0, 4)
}
const ends = computed(() => (props.points.length ? [when(props.points[0]!.t), when(props.points[props.points.length - 1]!.t)] : ['', '']))
const hov = ref<number | null>(null)
const box = ref<SVGSVGElement | null>(null)
function move(e: PointerEvent) { const r = box.value?.getBoundingClientRect(); if (!r || props.points.length < 2) return; const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); hov.value = Math.round(f * (props.points.length - 1)) }
const hp = computed(() => (hov.value == null ? null : props.points[hov.value] ?? null))
</script>
<template>
  <div class="pc">
    <div class="rd" aria-live="polite"><template v-if="hp"><b>{{ fmt(hp.v) }}</b><span>{{ when(hp.t) }}</span></template><span v-else class="mut">{{ ends[0] }} – {{ ends[1] }}</span></div>
    <svg ref="box" :viewBox="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" :style="{ height: H + 'px' }" role="img" :aria-label="label + ' from ' + ends[0] + ' to ' + ends[1]" @pointermove="move" @pointerleave="hov = null">
      <defs><linearGradient :id="'pg' + (up ? 'u' : 'd')" x1="0" x2="0" y1="0" y2="1"><stop offset="0"  stop-color="#2675b0" stop-opacity=".14" /><stop offset="1" stop-color="#2675b0" stop-opacity="0" /></linearGradient></defs>
      <rect v-if="band" x="0" :y="Math.max(PADT, y(Math.max(...band)))" :width="W" :height="Math.max(0, Math.min(H - PADB, y(Math.min(...band))) - Math.max(PADT, y(Math.max(...band))))" class="band" />
      <line v-for="g in 3" :key="g" class="gr" x1="0" :x2="W" :y1="PADT + (g * (H - PADT - PADB)) / 4" :y2="PADT + (g * (H - PADT - PADB)) / 4" />
      <line v-if="base != null" class="bs" x1="0" :x2="W" :y1="y(base)" :y2="y(base)" />
      <path v-if="area" :d="area" :fill="'url(#pg' + (up ? 'u' : 'd') + ')'" />
      <path :d="line" class="ln" />
      <g v-for="r in refs.filter((q) => inView(q.v))" :key="r.label"><line class="rf" x1="0" :x2="W" :y1="y(r.v)" :y2="y(r.v)" /></g>
      <g v-if="hp && hov != null"><line class="ch" :x1="x(hov)" :x2="x(hov)" :y1="PADT" :y2="H - PADB" /><circle :cx="x(hov)" :cy="y(hp.v)" r="4" class="dot" :class="{ dn: !up }" /></g>
      <circle v-else-if="points.length" :cx="x(points.length - 1)" :cy="y(points[points.length - 1]!.v)" r="3.5" class="dot" :class="{ dn: !up }" />
    </svg>
    <div class="rl"><span v-for="r in refs" :key="r.label" :class="{ off: !inView(r.v) }" :style="inView(r.v) ? { top: (y(r.v) / H) * 100 + '%' } : (r.v > hi ? { top: '0' } : { top: 'auto', bottom: '26px' })">{{ r.label }} {{ fmt(r.v) }}{{ inView(r.v) ? '' : r.v > hi ? ' ↑' : ' ↓' }}</span></div>
  </div>
</template>
<style scoped>
.pc { position: relative; } svg { width: 100%; display: block; touch-action: pan-y; cursor: crosshair; }
.rd { display: flex; gap: 10px; align-items: baseline; font-size: 13px; min-height: 20px; font-variant-numeric: tabular-nums; } .rd b { font-size: 15px; } .rd span { color: var(--c-muted); }
.ln { fill: none; stroke: var(--c-navy); stroke-width: 2; vector-effect: non-scaling-stroke; } 
.gr { stroke: rgba(15,17,21,.06); stroke-dasharray: 2 4; vector-effect: non-scaling-stroke; } .bs { stroke: rgba(15,17,21,.25); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.rf { stroke: var(--c-blue); stroke-dasharray: 6 4; stroke-width: 1.5; vector-effect: non-scaling-stroke; } .band { fill: var(--c-blue); fill-opacity: .06; }
.ch { stroke: rgba(15,17,21,.3); vector-effect: non-scaling-stroke; } .dot { fill: var(--c-blue); stroke: #fff; stroke-width: 2; vector-effect: non-scaling-stroke; } .dot.dn { fill: var(--c-danger); }
.rl { position: absolute; inset: 20px 0 0; pointer-events: none; } .rl span.off { transform: none; } .rl span { position: absolute; right: 0; transform: translateY(-120%); font-size: 11.5px; color: var(--c-blue-deep); background: rgba(255,255,255,.85); padding: 0 4px; font-variant-numeric: tabular-nums; }
.mut { color: var(--c-muted); }
</style>
