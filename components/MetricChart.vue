<script setup lang="ts">
// A small line chart: one metric across months. Plain SVG, no chart library.
const props = defineProps<{ label: string; unit: string; points: { period: string; value: number | null }[] }>()
const W = 300, H = 110, PAD = 8
const pts = computed(() => props.points.filter((p) => p.value !== null) as { period: string; value: number }[])
const range = computed(() => {
  const vs = pts.value.map((p) => p.value); const lo = Math.min(0, ...vs), hi = Math.max(...vs, 1)
  return { lo, hi: hi === lo ? lo + 1 : hi }
})
const xy = computed(() => pts.value.map((p, i) => ({
  x: pts.value.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (pts.value.length - 1),
  y: H - PAD - ((p.value - range.value.lo) / (range.value.hi - range.value.lo)) * (H - 2 * PAD), ...p
})))
const fmt = (n: number) => props.unit === 'usd' ? '$' + (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)))
  : props.unit === 'pct' ? n.toFixed(0) + '%' : String(Math.round(n))
const last = computed(() => pts.value[pts.value.length - 1])
const mon = (p: string) => new Date(p + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
</script>

<template>
  <figure class="mc">
    <figcaption><span class="label">{{ label }}</span><b v-if="last">{{ fmt(last.value) }}</b><span v-else class="none">No data</span></figcaption>
    <svg v-if="xy.length" :viewBox="'0 0 ' + W + ' ' + H" role="img" :aria-label="label + ' by month: ' + pts.map((p) => mon(p.period) + ' ' + fmt(p.value)).join(', ')">
      <polyline :points="xy.map((p) => p.x + ',' + p.y).join(' ')" fill="none" stroke="var(--c-blue)" stroke-width="2" />
      <circle v-for="p in xy" :key="p.period" :cx="p.x" :cy="p.y" r="3" fill="var(--c-navy)"><title>{{ mon(p.period) }}: {{ fmt(p.value) }}</title></circle>
    </svg>
    <div v-if="xy.length > 1" class="ax"><span>{{ mon(xy[0]!.period) }}</span><span>{{ mon(xy[xy.length - 1]!.period) }}</span></div>
  </figure>
</template>

<style scoped>
.mc { margin: 0; background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; }
figcaption { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
figcaption b { font-family: var(--font-heading); font-size: 22px; font-weight: 500; color: var(--c-navy); }
.none { font-size: 12px; color: var(--c-muted); }
svg { width: 100%; height: auto; display: block; }
.ax { display: flex; justify-content: space-between; font-size: 11px; color: var(--c-muted); margin-top: 2px; }
</style>
