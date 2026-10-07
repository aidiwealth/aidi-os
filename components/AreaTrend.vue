<script setup lang="ts">
// Area chart with axis labels and a hover readout (prices, rates, net worth).
const props = withDefaults(defineProps<{ points: { x: string; y: number }[]; color?: string; height?: number; format?: (v: number) => string }>(), { color: '#1c4f9c', height: 150, format: (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }) })
const W = 600, P = 6
const lo = computed(() => Math.min(...props.points.map((p) => p.y))), hi = computed(() => Math.max(...props.points.map((p) => p.y)))
const xy = (i: number, v: number) => [P + (i / Math.max(1, props.points.length - 1)) * (W - 2 * P), props.height - 18 - ((v - lo.value) / (hi.value - lo.value || 1)) * (props.height - 30)] as const
const line = computed(() => props.points.map((p, i) => { const [x, y] = xy(i, p.y); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1) }).join(' '))
const area = computed(() => props.points.length ? line.value + ' L' + (W - P) + ' ' + (props.height - 18) + ' L' + P + ' ' + (props.height - 18) + ' Z' : '')
const hover = ref<number | null>(null); const svg = ref<SVGSVGElement | null>(null)
function move(e: MouseEvent) { if (!svg.value || !props.points.length) return; const r = svg.value.getBoundingClientRect(); hover.value = Math.max(0, Math.min(props.points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (props.points.length - 1)))) }
const hp = computed(() => (hover.value == null ? null : { ...props.points[hover.value]!, pos: xy(hover.value, props.points[hover.value]!.y) }))
const gid = 'g' + Math.random().toString(36).slice(2, 8)
</script>
<template>
  <div class="tc">
    <svg ref="svg" :viewBox="'0 0 ' + W + ' ' + height" preserveAspectRatio="none" :style="{ height: height + 'px' }" @mousemove="move" @mouseleave="hover = null">
      <defs><linearGradient :id="gid" x1="0" x2="0" y1="0" y2="1"><stop offset="0" :stop-color="color" stop-opacity=".22" /><stop offset="1" :stop-color="color" stop-opacity="0" /></linearGradient></defs>
      <path v-if="points.length > 1" :d="area" :fill="'url(#' + gid + ')'" /><path v-if="points.length > 1" :d="line" fill="none" :stroke="color" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      <template v-if="hp"><line :x1="hp.pos[0]" :x2="hp.pos[0]" y1="0" :y2="height - 18" stroke="#c9ccd1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" /><circle :cx="hp.pos[0]" :cy="hp.pos[1]" r="4" :fill="color" /></template>
    </svg>
    <div v-if="hp" class="tip" :style="{ left: (hp.pos[0] / W) * 100 + '%' }"><b>{{ format(hp.y) }}</b><span>{{ hp.x }}</span></div>
    <div class="ax"><span>{{ points[0]?.x }}</span><span class="rg">Low {{ format(lo) }} · High {{ format(hi) }}</span><span>{{ points[points.length - 1]?.x }}</span></div>
  </div>
</template>
<style scoped>
.tc { position: relative; } svg { width: 100%; display: block; cursor: crosshair; } .ax { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--c-muted); margin-top: -14px; } .rg { opacity: .8; }
.tip { position: absolute; top: -6px; transform: translateX(-50%); background: var(--c-navy); color: #fff; padding: 4px 8px; font-size: 12px; white-space: nowrap; pointer-events: none; display: flex; gap: 6px; }
</style>
