<script setup lang="ts">
// Monthly excess returns of the stock against the market's, with the fitted line and its equation (like the Stanford
// CAPM tool): the slope is the beta, where it crosses zero the alpha.
import { fixed, month } from '~/shared/market-format'
const props = defineProps<{ points: { m: string; x: number; y: number }[]; beta: number; alpha: number; label?: string }>()
const W = 520, H = 300, P = 34
const ext = computed(() => { const a = props.points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]); return Math.max(0.02, ...a) * 1.1 })
const sx = (x: number) => P + ((x + ext.value) / (2 * ext.value)) * (W - 2 * P)
const sy = (y: number) => H - P - ((y + ext.value) / (2 * ext.value)) * (H - 2 * P)
const line = computed(() => { const x1 = -ext.value, x2 = ext.value; return { x1: sx(x1), y1: sy(props.alpha + props.beta * x1), x2: sx(x2), y2: sy(props.alpha + props.beta * x2) } })
const eq = computed(() => 'y = ' + fixed(props.beta, 2) + 'x ' + (props.alpha < 0 ? '− ' : '+ ') + fixed(Math.abs(props.alpha * 100), 2) + '%')
const tick = computed(() => { const s = ext.value > 0.15 ? 0.1 : ext.value > 0.08 ? 0.05 : 0.02; const out: number[] = []; for (let v = -Math.floor(ext.value / s) * s; v <= ext.value + 1e-9; v += s) out.push(Math.round(v * 1000) / 1000); return out })
const hover = ref<number | null>(null)
const cid = 'bs' + useId().replace(/[^a-zA-Z0-9]/g, '')
</script>
<template>
  <figure class="bs">
    <svg :viewBox="'0 0 ' + W + ' ' + H" role="img" :aria-label="(label || 'Monthly excess returns against the market') + ': ' + eq">
      <g class="grid"><line v-for="t in tick" :key="'x' + t" :x1="sx(t)" :x2="sx(t)" :y1="P" :y2="H - P" /><line v-for="t in tick" :key="'y' + t" :y1="sy(t)" :y2="sy(t)" :x1="P" :x2="W - P" /></g>
      <line class="ax" :x1="sx(0)" :x2="sx(0)" :y1="P" :y2="H - P" /><line class="ax" :y1="sy(0)" :y2="sy(0)" :x1="P" :x2="W - P" />
      <text v-for="t in tick" :key="'tx' + t" class="tk" :x="sx(t)" :y="H - P + 14" text-anchor="middle">{{ Math.round(t * 100) }}%</text>
      <text v-for="t in tick" :key="'ty' + t" class="tk" :x="P - 6" :y="sy(t) + 4" text-anchor="end">{{ Math.round(t * 100) }}%</text>
      <clipPath :id="cid"><rect :x="P" :y="P" :width="W - 2 * P" :height="H - 2 * P" /></clipPath><line class="fit" v-bind="line" :clip-path="'url(#' + cid + ')'" />
      <circle v-for="(p, i) in points" :key="p.m" :cx="sx(p.x)" :cy="sy(p.y)" :r="hover === i ? 5 : 3.2" class="pt" @mouseenter="hover = i" @mouseleave="hover = null" />
      <text class="eq" :x="W - P" :y="P - 10" text-anchor="end">{{ eq }}</text>
      <text class="al" :x="(W) / 2" :y="H - 4" text-anchor="middle">Market (SPY) excess return</text>
      <text class="al" :x="10" :y="H / 2" text-anchor="middle" :transform="'rotate(-90 10 ' + H / 2 + ')'">Stock excess return</text>
    </svg>
    <figcaption v-if="hover != null && points[hover]">{{ month(points[hover]!.m) }}: market {{ fixed(points[hover]!.x * 100, 1) }}%, stock {{ fixed(points[hover]!.y * 100, 1) }}%</figcaption>
  </figure>
</template>
<style scoped>
.bs { margin: 0; } svg { width: 100%; max-width: 620px; display: block; }
.grid line { stroke: rgba(15,17,21,.06); } .ax { stroke: rgba(15,17,21,.25); }
.tk { font-size: 10px; fill: var(--c-muted); font-variant-numeric: tabular-nums; } .al { font-size: 11px; fill: var(--c-muted); }
.pt { fill: var(--c-blue); fill-opacity: .7; cursor: default; } .fit { stroke: var(--c-navy); stroke-width: 2; }
.eq { font-size: 13px; font-weight: 600; fill: var(--c-navy); }
figcaption { font-size: 12px; color: var(--c-muted); min-height: 16px; }
</style>
