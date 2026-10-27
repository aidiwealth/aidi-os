<script setup lang="ts">
// Bars for an amount by period (solid for actual years, lighter for forecast years) with an optional percentage line on
// its own scale (for example revenue with operating margin). Hover a period to read both.
import { big, fixed } from '~/shared/market-format'
const props = withDefaults(defineProps<{ rows: { label: string; value: number; pct?: number | null; forecast?: boolean }[]; barName: string; lineName?: string; height?: number }>(), { lineName: '', height: 200 })
const W = 800, PADT = 14, PADB = 26
const hi = computed(() => Math.max(1, ...props.rows.map((r) => r.value)) * 1.1)
const lo = computed(() => Math.min(0, ...props.rows.map((r) => r.value)) * 1.1)
const pv = computed(() => props.rows.map((r) => r.pct).filter((x): x is number => x != null && Number.isFinite(x)))
const plo = computed(() => Math.min(0, ...pv.value)), phi = computed(() => Math.max(1, ...pv.value) * 1.25)
const bw = computed(() => W / Math.max(1, props.rows.length))
const y = (v: number) => PADT + ((hi.value - v) / (hi.value - lo.value || 1)) * (props.height - PADT - PADB)
const yp = (v: number) => PADT + ((phi.value - v) / (phi.value - plo.value || 1)) * (props.height - PADT - PADB)
const line = computed(() => props.rows.map((r, i) => (r.pct == null ? null : [i * bw.value + bw.value / 2, yp(r.pct)] as const)).filter((p): p is readonly [number, number] => !!p).map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '))
const hov = ref<number | null>(null)
const firstF = computed(() => props.rows.findIndex((r) => r.forecast))
</script>
<template>
  <div class="bl">
    <div class="lg"><span><i class="sq" />{{ barName }}</span><span v-if="firstF >= 0"><i class="sq f" />Forecast</span><span v-if="lineName && pv.length"><i class="ln" />{{ lineName }}</span>
      <b v-if="hov != null && rows[hov]">{{ rows[hov]!.label }}: {{ big(rows[hov]!.value) }}{{ rows[hov]!.pct != null ? ' · ' + fixed(rows[hov]!.pct!, 1) + '%' : '' }}</b></div>
    <svg :viewBox="'0 0 ' + W + ' ' + height" preserveAspectRatio="none" :style="{ height: height + 'px' }" role="img" :aria-label="barName + (lineName ? ' and ' + lineName : '') + ' by year'" @pointerleave="hov = null">
      <line class="z" x1="0" :x2="W" :y1="y(0)" :y2="y(0)" />
      <line v-if="firstF > 0" class="cut" :x1="firstF * bw" :x2="firstF * bw" :y1="PADT" :y2="height - PADB" />
      <g v-for="(r, i) in rows" :key="r.label" @pointerenter="hov = i">
        <rect :x="i * bw" y="0" :width="bw" :height="height" fill="transparent" />
        <rect :x="i * bw + bw * 0.18" :y="Math.min(y(r.value), y(0))" :width="bw * 0.64" :height="Math.max(1, Math.abs(y(r.value) - y(0)))" class="b" :class="{ f: r.forecast, neg: r.value < 0, on: hov === i }" />
      </g>
      <path v-if="line" :d="line" class="pl" />
    </svg>
    <div class="xl"><span v-for="(r, i) in rows" :key="r.label" :style="{ width: 100 / rows.length + '%' }" :class="{ dim: rows.length > 12 && i % 2, dm: rows.length > 8 && i % 2 }">{{ r.label }}</span></div>
  </div>
</template>
<style scoped>
svg { width: 100%; display: block; }
.lg { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--c-muted); min-height: 20px; margin-bottom: 4px; } .lg b { margin-left: auto; color: var(--c-ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.sq { display: inline-block; width: 10px; height: 10px; background: var(--c-navy); margin-right: 5px; vertical-align: -1px; } .sq.f { background: #b9cfe2; } .lg .ln { display: inline-block; width: 14px; height: 2px; background: var(--c-blue); margin-right: 5px; vertical-align: 3px; }
.b { fill: var(--c-navy); } .b.f { fill: #b9cfe2; } .b.neg { fill: #c9584f; } .b.on { opacity: .8; }
.pl { fill: none; stroke: var(--c-blue); stroke-width: 2; vector-effect: non-scaling-stroke; } .z { stroke: rgba(15,17,21,.2); vector-effect: non-scaling-stroke; } .cut { stroke: rgba(15,17,21,.2); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.xl { display: flex; font-size: 11px; color: var(--c-muted); } .xl span { text-align: center; white-space: nowrap; overflow: hidden; } .xl .dim { visibility: hidden; } @media (max-width: 700px) { .xl .dm { visibility: hidden; } .xl { font-size: 10px; } }
</style>
