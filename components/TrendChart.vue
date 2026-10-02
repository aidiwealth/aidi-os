<script setup lang="ts">
// Smooth line with a soft gradient fill, drawn in plain SVG (the Telroi dashboard style, in Aidi colours).
const props = withDefaults(defineProps<{ title: string; sub?: string; points: { label: string; value: number }[]; unit?: 'usd' | 'count' | 'pct'; foot?: string }>(), { sub: '', unit: 'count', foot: '' })
const W = 560, H = 150, PADY = 16
const uid = 'tc' + Math.random().toString(36).slice(2, 8)
const max = computed(() => Math.max(1, ...props.points.map((p) => p.value)))
const pts = computed(() => props.points.map((d, i) => ({
  x: props.points.length > 1 ? (i / (props.points.length - 1)) * W : W / 2,
  y: H - PADY - (d.value / max.value) * (H - PADY * 2)
})))
function smooth(p: { x: number; y: number }[]): string {
  if (!p.length) return ''
  if (p.length < 3) return p.map((q, i) => (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1)).join(' ')
  let d = 'M' + p[0]!.x.toFixed(1) + ' ' + p[0]!.y.toFixed(1)
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!, p1 = p[i]!, p2 = p[i + 1]!, p3 = p[i + 2] ?? p2, t = 0.18
    const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y) // keep the curve between its two points: no dips below zero
    const cy = (v: number) => Math.min(hi, Math.max(lo, v)).toFixed(1)
    d += ' C' + (p1.x + (p2.x - p0.x) * t).toFixed(1) + ' ' + cy(p1.y + (p2.y - p0.y) * t) + ' ' + (p2.x - (p3.x - p1.x) * t).toFixed(1) + ' ' + cy(p2.y - (p3.y - p1.y) * t) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1)
  }
  return d
}
const line = computed(() => smooth(pts.value))
const area = computed(() => (pts.value.length ? line.value + ' L' + W + ' ' + H + ' L0 ' + H + ' Z' : ''))
const last = computed(() => pts.value[pts.value.length - 1] ?? { x: 0, y: 0 })
const fmt = (n: number) => props.unit === 'usd' ? '$' + (n >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : Math.round(n)) : props.unit === 'pct' ? n.toFixed(0) + '%' : String(Math.round(n))
const lastVal = computed(() => props.points[props.points.length - 1]?.value ?? 0)
const hasData = computed(() => props.points.some((p) => p.value > 0))
</script>

<template>
  <div class="tc card">
    <div class="tc-head"><span class="tc-title">{{ title }}</span><span class="tc-sub">{{ sub }}</span></div>
    <div class="tc-body">
      <svg v-if="hasData" :viewBox="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" :aria-label="title + ': ' + points.map((p) => p.label + ' ' + fmt(p.value)).join(', ')">
        <defs><linearGradient :id="uid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--c-blue)" stop-opacity="0.18" /><stop offset="100%" stop-color="var(--c-blue)" stop-opacity="0" /></linearGradient></defs>
        <path :d="area" :fill="'url(#' + uid + ')'" />
        <path :d="line" fill="none" stroke="var(--c-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        <circle :cx="last.x" :cy="last.y" r="3.5" fill="var(--c-blue)" />
      </svg>
      <div v-else class="tc-empty">No data yet</div>
    </div>
    <div class="tc-axis" v-if="hasData && points.length > 1"><span>{{ points[0]!.label }}</span><span>{{ points[points.length - 1]!.label }}</span></div>
    <div class="tc-foot"><span class="muted">{{ foot }}</span><b>{{ fmt(lastVal) }}</b></div>
  </div>
</template>

<style scoped>
.tc { padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.tc-head { display: flex; justify-content: space-between; align-items: baseline; padding: 18px 22px 0; }
.tc-title { font-family: var(--font-heading); font-size: 20px; color: var(--c-navy); }
.tc-sub { font-size: 12.5px; color: var(--c-muted); }
.tc-body { padding: 16px 8px 4px; min-height: 150px; }
.tc-body svg { width: 100%; height: 150px; display: block; }
.tc-empty { height: 150px; display: flex; align-items: center; justify-content: center; color: var(--c-muted); font-size: 13px; }
.tc-axis { display: flex; justify-content: space-between; padding: 0 12px; font-size: 11px; color: var(--c-muted); }
.tc-foot { display: flex; justify-content: space-between; align-items: center; padding: 12px 22px; border-top: 1px solid var(--c-rule); font-size: 13px; margin-top: 8px; }
.tc-foot b { color: var(--c-blue-deep); font-weight: 600; }
.muted { color: var(--c-muted); }
</style>
