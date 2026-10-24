<script setup lang="ts">
// How concentrated revenue is: customers from largest to smallest along the bottom, the share of revenue they make up
// together going up. A curve that rises steeply means a few customers carry the business.
const props = defineProps<{ title: string; shares: number[]; sub?: string }>()
const W = 560, H = 190, P = 14
const pts = computed(() => {
  const s = [...props.shares].filter((x) => x > 0).sort((a, b) => b - a), n = s.length; if (!n) return [] as { x: number; y: number }[]
  const tot = s.reduce((a, b) => a + b, 0), out = [{ x: 0, y: 0 }]; let cum = 0
  const step = Math.max(1, Math.floor(n / 200))
  for (let i = 0; i < n; i++) { cum += s[i]!; if (i % step === 0 || i === n - 1) out.push({ x: (i + 1) / n, y: cum / tot }) }
  return out
})
const at = (p: number) => { const q = pts.value.find((x) => x.y >= p); return q ? q.x : 1 }
const p80 = computed(() => at(0.8)), p50 = computed(() => at(0.5))
const X = (v: number) => P + v * (W - P * 2), Y = (v: number) => H - P - v * (H - P * 2)
const path = computed(() => pts.value.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' '))
const pc = (v: number) => (v < 0.01 ? (Math.round(v * 1000) / 10) : Math.round(v * 100)) + '%'
</script>

<template>
  <div class="pc card">
    <div class="pc-head"><span class="pc-title">{{ title }}</span><span class="pc-sub">{{ sub }}</span></div>
    <svg v-if="pts.length" :viewBox="'0 0 ' + W + ' ' + H" role="img" :aria-label="title">
      <line :x1="X(0)" :x2="X(1)" :y1="Y(0)" :y2="Y(1)" class="eq" />
      <line :x1="X(0)" :x2="X(1)" :y1="Y(0.8)" :y2="Y(0.8)" class="g" /><text :x="X(1)" :y="Y(0.8) - 4" text-anchor="end" class="t">80% of revenue</text>
      <path :d="path + ' L' + X(1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + ' Z'" class="ar" /><path :d="path" class="ln" />
      <line :x1="X(p80)" :x2="X(p80)" :y1="Y(0)" :y2="Y(0.8)" class="mk" /><circle :cx="X(p80)" :cy="Y(0.8)" r="4" class="dt" />
    </svg>
    <p class="pc-foot"><b>{{ pc(p50) }}</b> of customers make half the revenue; <b>{{ pc(p80) }}</b> make 80%. Dashed line: an even spread.</p>
  </div>
</template>

<style scoped>
.pc { padding: 16px 20px 12px; display: flex; flex-direction: column; gap: 8px; } .pc-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.pc-title { font-family: var(--font-heading); font-size: 17px; font-weight: 500; color: var(--c-navy); } .pc-sub { font-size: 12px; color: var(--c-muted); }
svg { width: 100%; height: auto; display: block; } .eq { stroke: var(--c-rule-strong); stroke-dasharray: 4 3; } .g { stroke: var(--c-rule); } .t { font-size: 11px; fill: var(--c-muted); }
.ar { fill: var(--c-blue); opacity: .1; } .ln { fill: none; stroke: var(--c-navy); stroke-width: 2; } .mk { stroke: var(--c-navy); stroke-dasharray: 2 2; } .dt { fill: var(--c-navy); }
.pc-foot { margin: 0; font-size: 12.5px; color: var(--c-ink-soft); } .pc-foot b { color: var(--c-navy); font-weight: 500; }
</style>
