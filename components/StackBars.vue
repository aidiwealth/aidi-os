<script setup lang="ts">
// Bars stacked above and below zero for each period: what added (above) and what took away (below), e.g. new,
// expansion and returning revenue against downgrades and losses. Hover a period to read every part of it.
const props = withDefaults(defineProps<{ title: string; sub?: string; labels: string[]; series: { name: string; values: number[]; down?: boolean }[]; unit?: 'money' | 'count'; currency?: string; foot?: string }>(), { sub: '', unit: 'money', currency: 'USD', foot: '' })
const W = 560, H = 180, PAD = 10
const UP = ['var(--c-navy)', '#3d6bb3', '#9fb4d6'], DOWN = ['#b2453b', '#e3a8a1']
const colors = computed(() => { let u = 0, d = 0; return props.series.map((s) => (s.down ? DOWN[d++ % DOWN.length] : UP[u++ % UP.length])!) })
const tops = computed(() => props.labels.map((_, i) => props.series.filter((s) => !s.down).reduce((t, s) => t + Math.max(0, s.values[i] ?? 0), 0)))
const bots = computed(() => props.labels.map((_, i) => props.series.filter((s) => s.down).reduce((t, s) => t + Math.abs(s.values[i] ?? 0), 0)))
const hi = computed(() => Math.max(1, ...tops.value)), lo = computed(() => Math.max(0, ...bots.value))
const y = (v: number) => PAD + ((hi.value - v) / (hi.value + lo.value)) * (H - PAD * 2)
const zero = computed(() => y(0))
const slot = computed(() => W / Math.max(1, props.labels.length)), bw = computed(() => Math.max(4, Math.min(30, slot.value * 0.6)))
const rects = computed(() => props.labels.flatMap((_, i) => {
  let up = 0, dn = 0
  return props.series.map((s, k) => {
    const v = Math.abs(s.values[i] ?? 0); if (!v) return null
    const a = s.down ? -dn : up, b = s.down ? -(dn += v) : (up += v)
    return { i, k, x: (i + 0.5) * slot.value - bw.value / 2, y: y(Math.max(a, b)), h: Math.max(1, Math.abs(y(a) - y(b))), fill: colors.value[k]! }
  }).filter((r): r is NonNullable<typeof r> => !!r)
}))
const fmt = (n: number) => (props.unit === 'money' ? briefMoney(n, props.currency) : Math.round(n).toLocaleString('en-US'))
const hover = ref<number | null>(null)
function move(ev: MouseEvent) { const r = (ev.currentTarget as SVGElement).getBoundingClientRect(); const n = props.labels.length; hover.value = n ? Math.max(0, Math.min(n - 1, Math.floor(((ev.clientX - r.left) / r.width) * n))) : null }
const hasData = computed(() => tops.value.some((v) => v > 0) || bots.value.some((v) => v > 0))
</script>

<template>
  <div class="sb card">
    <div class="sb-head"><span class="sb-title">{{ title }}</span><span class="sb-sub">{{ hover !== null ? labels[hover] : sub }}</span></div>
    <div class="sb-legend"><span v-for="(s, k) in series" :key="s.name"><i :style="{ background: colors[k] }" />{{ s.down ? '− ' : '+ ' }}{{ s.name }}<b v-if="hover !== null">{{ fmt(Math.abs(s.values[hover] ?? 0)) }}</b></span></div>
    <div class="sb-body">
      <svg v-if="hasData" :viewBox="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" :aria-label="title" @mousemove="move" @mouseleave="hover = null">
        <rect v-for="r in rects" :key="r.i + '-' + r.k" :x="r.x" :y="r.y" :width="bw" :height="r.h" :fill="r.fill" :opacity="hover === null || hover === r.i ? 1 : 0.35" />
        <line x1="0" :x2="W" :y1="zero" :y2="zero" stroke="var(--c-rule-strong)" stroke-width="1" vector-effect="non-scaling-stroke" />
      </svg>
      <div v-else class="sb-empty">No movement yet</div>
    </div>
    <div v-if="hasData && labels.length > 1" class="sb-axis"><span>{{ labels[0] }}</span><span>{{ labels[labels.length - 1] }}</span></div>
    <div v-if="foot" class="sb-foot">{{ foot }}</div>
  </div>
</template>

<style scoped>
.sb { padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.sb-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 16px 20px 0; }
.sb-title { font-family: var(--font-heading); font-size: 17px; font-weight: 500; color: var(--c-navy); } .sb-sub { font-size: 12px; color: var(--c-muted); white-space: nowrap; }
.sb-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 8px 20px 0; font-size: 12px; color: var(--c-ink-soft); } .sb-legend span { display: inline-flex; align-items: center; gap: 6px; } .sb-legend i { width: 9px; height: 9px; display: inline-block; } .sb-legend b { font-weight: 600; font-variant-numeric: tabular-nums; }
.sb-body { padding: 12px 10px 4px; } .sb-body svg { width: 100%; height: 180px; display: block; cursor: crosshair; } .sb-empty { height: 180px; display: flex; align-items: center; justify-content: center; color: var(--c-muted); font-size: 13px; }
.sb-axis { display: flex; justify-content: space-between; padding: 0 12px 12px; font-size: 11px; color: var(--c-muted); } .sb-foot { padding: 10px 20px; border-top: 1px solid var(--c-rule); font-size: 12.5px; color: var(--c-muted); }
</style>
