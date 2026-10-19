<script setup lang="ts">
import { shortAmount } from '~/shared/compact'
// A figure over time in plain SVG: a line (revenue, cash) or bars above and below zero (profit and loss), so losses
// show as clearly as gains. Zero is drawn whenever the figures cross it. Hover a period to read its value.
const props = withDefaults(defineProps<{ title: string; sub?: string; points: { label: string; value: number }[]; unit?: 'usd' | 'count' | 'pct'; foot?: string; symbol?: string; bars?: boolean; footValue?: number | null }>(), { sub: '', unit: 'count', foot: '', symbol: '$', bars: false, footValue: undefined })
const W = 560, H = 160, PADY = 14
const uid = 'tc' + useId().replace(/[^a-zA-Z0-9]/g, '')
const lo = computed(() => Math.min(0, ...props.points.map((p) => p.value)))
const hi = computed(() => Math.max(0, ...props.points.map((p) => p.value)))
const span = computed(() => (hi.value - lo.value) || 1)
const y = (v: number) => PADY + ((hi.value - v) / span.value) * (H - PADY * 2)
const zero = computed(() => y(0))
const step = computed(() => (props.points.length > 1 ? W / (props.points.length - 1) : W))
const pts = computed(() => props.points.map((d, i) => ({ x: props.points.length > 1 ? i * step.value : W / 2, y: y(d.value), v: d.value, label: d.label })))
function smooth(p: { x: number; y: number }[]): string {
  if (!p.length) return ''
  if (p.length < 3) return p.map((q, i) => (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1)).join(' ')
  let d = 'M' + p[0]!.x.toFixed(1) + ' ' + p[0]!.y.toFixed(1)
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!, p1 = p[i]!, p2 = p[i + 1]!, p3 = p[i + 2] ?? p2, t = 0.18
    const a = Math.min(p1.y, p2.y), b = Math.max(p1.y, p2.y), cy = (v: number) => Math.min(b, Math.max(a, v)).toFixed(1)
    d += ' C' + (p1.x + (p2.x - p0.x) * t).toFixed(1) + ' ' + cy(p1.y + (p2.y - p0.y) * t) + ' ' + (p2.x - (p3.x - p1.x) * t).toFixed(1) + ' ' + cy(p2.y - (p3.y - p1.y) * t) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1)
  }
  return d
}
const line = computed(() => smooth(pts.value))
const area = computed(() => (pts.value.length ? line.value + ' L' + pts.value[pts.value.length - 1]!.x.toFixed(1) + ' ' + zero.value.toFixed(1) + ' L' + pts.value[0]!.x.toFixed(1) + ' ' + zero.value.toFixed(1) + ' Z' : ''))
const bw = computed(() => Math.max(3, Math.min(28, (W / Math.max(1, props.points.length)) * 0.62)))
const bx = (i: number) => (props.points.length > 1 ? (i + 0.5) * (W / props.points.length) : W / 2)
const fmt = (n: number) => { const a = Math.abs(n), s = n < 0 ? '−' : ''; return props.unit === 'usd' ? shortAmount(n, props.symbol) : props.unit === 'pct' ? n.toFixed(0) + '%' : s + Math.round(a).toLocaleString('en-US') }
const lastVal = computed(() => (props.footValue !== undefined ? props.footValue : props.points[props.points.length - 1]?.value ?? null))
const hasData = computed(() => props.points.some((p) => p.value !== 0))
const crosses = computed(() => lo.value < 0)
const hover = ref<number | null>(null)
function move(ev: MouseEvent) { const r = (ev.currentTarget as SVGElement).getBoundingClientRect(); const x = ((ev.clientX - r.left) / r.width) * W; const n = props.points.length; hover.value = n ? Math.max(0, Math.min(n - 1, props.bars ? Math.floor((x / W) * n) : Math.round(x / step.value))) : null }
const hp = computed(() => (hover.value === null ? null : props.points[hover.value] ?? null))
const summary = computed(() => { if (!props.bars || !props.points.length) return ''; const pos = props.points.filter((p) => p.value > 0).length, neg = props.points.filter((p) => p.value < 0).length; return pos && neg ? pos + ' up, ' + neg + ' down' : neg ? 'All ' + neg + ' periods below zero' : 'All above zero' })
</script>

<template>
  <div class="tc card">
    <div class="tc-head"><span class="tc-title">{{ title }}</span><span class="tc-sub">{{ hp ? hp.label + ': ' + fmt(hp.value) : sub || summary }}</span></div>
    <div class="tc-body">
      <svg v-if="hasData" :viewBox="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" :aria-label="title + ': ' + points.map((p) => p.label + ' ' + fmt(p.value)).join(', ')" @mousemove="move" @mouseleave="hover = null">
        <defs><linearGradient :id="uid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--c-blue)" stop-opacity="0.16" /><stop offset="100%" stop-color="var(--c-blue)" stop-opacity="0.02" /></linearGradient></defs>
        <line v-if="crosses" x1="0" :x2="W" :y1="zero" :y2="zero" stroke="var(--c-rule-strong)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
        <template v-if="bars">
          <rect v-for="(p, i) in pts" :key="i" :x="bx(i) - bw / 2" :y="Math.min(p.y, zero)" :width="bw" :height="Math.max(1, Math.abs(zero - p.y))" :fill="p.v < 0 ? 'var(--c-danger)' : 'var(--c-navy)'" :opacity="hover === null || hover === i ? (p.v < 0 ? 0.75 : 0.85) : 0.35" />
        </template>
        <template v-else>
          <path :d="area" :fill="'url(#' + uid + ')'" />
          <path :d="line" fill="none" stroke="var(--c-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          <line v-if="hover !== null && pts[hover]" :x1="pts[hover]!.x" :x2="pts[hover]!.x" y1="0" :y2="H" stroke="var(--c-rule-strong)" stroke-width="1" vector-effect="non-scaling-stroke" />
          <circle v-for="(p, i) in pts" v-show="i === pts.length - 1 || i === hover || p.v < 0" :key="i" :cx="p.x" :cy="p.y" :r="i === hover ? 4 : 3" :fill="p.v < 0 ? 'var(--c-danger)' : 'var(--c-blue)'" />
        </template>
      </svg>
      <div v-else class="tc-empty">No figures yet</div>
    </div>
    <div v-if="hasData && points.length > 1" class="tc-axis"><span>{{ points[0]!.label }}</span><span v-if="crosses" class="z">Zero line dashed</span><span>{{ points[points.length - 1]!.label }}</span></div>
    <div class="tc-foot"><span class="muted">{{ foot }}</span><b :class="{ neg: (lastVal ?? 0) < 0 }">{{ lastVal == null ? '—' : fmt(lastVal) }}</b></div>
  </div>
</template>

<style scoped>
.tc { padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.tc-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 16px 20px 0; }
.tc-title { font-family: var(--font-heading); font-size: 17px; font-weight: 500; color: var(--c-navy); }
.tc-sub { font-size: 12px; color: var(--c-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.tc-body { padding: 14px 10px 4px; min-height: 160px; }
.tc-body svg { width: 100%; height: 160px; display: block; cursor: crosshair; }
.tc-empty { height: 160px; display: flex; align-items: center; justify-content: center; color: var(--c-muted); font-size: 13px; }
.tc-axis { display: flex; justify-content: space-between; padding: 0 12px; font-size: 11px; color: var(--c-muted); } .tc-axis .z { font-style: italic; }
.tc-foot { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-top: 1px solid var(--c-rule); font-size: 13px; margin-top: 8px; }
.tc-foot b { color: var(--c-navy); font-weight: 600; font-variant-numeric: tabular-nums; } .tc-foot b.neg { color: var(--c-danger); }
.muted { color: var(--c-muted); }
</style>
