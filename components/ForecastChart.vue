<script setup lang="ts">
// Revenue and costs as bars, cash as a line (own scale), actual months then forecast months.
const props = defineProps<{ actual: { month: string; revenue: number; costs: number; cash: number | null }[]; forecast: { month: string; revenue: number; costs: number; cash: number }[]; currency: string }>()
const W = 900, H = 260, PL = 8, PR = 8, PT = 14, PB = 26
const all = computed(() => [...props.actual.map((x) => ({ ...x, f: false })), ...props.forecast.map((x) => ({ ...x, f: true }))])
const maxBar = computed(() => Math.max(1, ...all.value.map((x) => Math.max(x.revenue, x.costs))))
const cashVals = computed(() => all.value.map((x) => x.cash).filter((v): v is number => v !== null))
const cMin = computed(() => Math.min(0, ...cashVals.value)), cMax = computed(() => Math.max(1, ...cashVals.value))
const step = computed(() => (W - PL - PR) / Math.max(1, all.value.length))
const bw = computed(() => Math.max(2, step.value * 0.34))
const y = (v: number) => PT + (H - PT - PB) * (1 - v / maxBar.value)
const yc = (v: number) => PT + (H - PT - PB) * (1 - (v - cMin.value) / Math.max(1, cMax.value - cMin.value))
const line = computed(() => all.value.map((x, i) => (x.cash === null ? null : [PL + step.value * i + step.value / 2, yc(x.cash)] as const)).filter(Boolean).map((p, i) => (i ? 'L' : 'M') + p![0].toFixed(1) + ' ' + p![1].toFixed(1)).join(' '))
const split = computed(() => PL + step.value * props.actual.length)
const zero = computed(() => (cMin.value < 0 ? yc(0) : null))
const lbl = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const every = computed(() => Math.max(1, Math.ceil(all.value.length / 12)))
const hover = ref(-1)
const h = computed(() => (hover.value >= 0 ? all.value[hover.value] : null))
</script>
<template>
  <div class="fcw">
    <div class="lg"><span><i class="r" />Revenue</span><span><i class="c" />Costs</span><span><i class="l" />Cash</span><span v-if="actual.length && forecast.length" class="mut">Actual | Forecast</span>
      <span v-if="h" class="hv"><b>{{ lbl(h.month) }}{{ h.f ? ' (forecast)' : '' }}</b> · Revenue {{ briefMoney(h.revenue, currency) }} · Costs {{ briefMoney(h.costs, currency) }}<template v-if="h.cash !== null"> · Cash {{ briefMoney(h.cash, currency) }}</template></span></div>
    <svg :viewBox="'0 0 ' + W + ' ' + H" class="sv" role="img" aria-label="Revenue, costs and cash by month" @mouseleave="hover = -1">
      <rect v-if="actual.length && forecast.length" :x="split" :y="PT - 6" :width="W - PR - split" :height="H - PT - PB + 6" fill="#f4f6f9" />
      <line :x1="PL" :x2="W - PR" :y1="H - PB" :y2="H - PB" stroke="#d9dde3" />
      <line v-if="zero !== null" :x1="PL" :x2="W - PR" :y1="zero" :y2="zero" stroke="#b42318" stroke-dasharray="3 3" stroke-width="1" />
      <g v-for="(x, i) in all" :key="x.month" @mouseenter="hover = i">
        <rect :x="PL + step * i" :y="PT - 6" :width="step" :height="H - PT - PB + 6" fill="transparent" />
        <rect :x="PL + step * i + step / 2 - bw - 1" :y="y(x.revenue)" :width="bw" :height="Math.max(0, H - PB - y(x.revenue))" :fill="x.f ? '#5b7fa6' : '#0c1a2e'" />
        <rect :x="PL + step * i + step / 2 + 1" :y="y(x.costs)" :width="bw" :height="Math.max(0, H - PB - y(x.costs))" :fill="x.f ? '#d5dbe3' : '#aab4c2'" />
        <text v-if="i % every === 0" :x="PL + step * i + step / 2" :y="H - 8" text-anchor="middle" class="tx">{{ lbl(x.month) }}</text>
      </g>
      <path :d="line" fill="none" stroke="#2675b0" stroke-width="2" />
      <line v-if="actual.length && forecast.length" :x1="split" :x2="split" :y1="PT - 6" :y2="H - PB" stroke="#9aa3af" stroke-dasharray="2 3" />
    </svg>
  </div>
</template>
<style scoped>
.fcw { display: flex; flex-direction: column; gap: 8px; } .sv { width: 100%; height: auto; display: block; } .tx { font-size: 10.5px; fill: var(--c-muted); }
.lg { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--c-ink-soft); align-items: center; min-height: 20px; } .lg i { display: inline-block; width: 10px; height: 10px; margin-right: 5px; vertical-align: -1px; } .lg .r { background: #0c1a2e; } .lg .c { background: #aab4c2; } .lg .l { height: 2px; background: #2675b0; vertical-align: 3px; } .mut { color: var(--c-muted); } .hv { margin-left: auto; color: var(--c-ink); }
</style>
