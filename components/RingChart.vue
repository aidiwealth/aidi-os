<script setup lang="ts">
// A small doughnut in Finvry's blues with a figure in the middle and a legend beside it.
const props = defineProps<{ parts: { label: string; value: number; color: string; note?: string }[]; center: string; sub?: string; label?: string }>()
const C = 2 * Math.PI * 46
const arcs = computed(() => {
  const total = props.parts.reduce((a, x) => a + Math.max(0, x.value), 0) || 1; let off = 0
  return props.parts.filter((x) => x.value > 0).map((x) => { const len = (x.value / total) * C; const a = { ...x, dash: len.toFixed(2) + ' ' + C.toFixed(2), offset: (-off).toFixed(2) }; off += len; return a })
})
</script>
<template>
  <div class="rg">
    <svg viewBox="0 0 120 120" role="img" :aria-label="label || parts.map((p) => p.label + ' ' + (p.note ?? p.value)).join(', ')"><circle cx="60" cy="60" r="46" fill="none" stroke="#f1f0ec" stroke-width="16" /><circle v-for="a in arcs" :key="a.label" cx="60" cy="60" r="46" fill="none" :stroke="a.color" stroke-width="16" :stroke-dasharray="a.dash" :stroke-dashoffset="a.offset" transform="rotate(-90 60 60)" /><text x="60" :y="sub ? 58 : 66" text-anchor="middle" font-size="17" font-weight="700" fill="#0c1a2e">{{ center }}</text><text v-if="sub" x="60" y="74" text-anchor="middle" font-size="9.5" fill="#5d6470">{{ sub }}</text></svg>
    <div class="lg"><span v-for="p in parts" :key="p.label"><i :style="{ background: p.color }" />{{ p.label }}<b>{{ p.note ?? p.value }}</b></span></div>
  </div>
</template>
<style scoped>
.rg { display: flex; gap: 16px; align-items: center; } .rg svg { width: 112px; height: 112px; flex: none; }
.lg { display: flex; flex-direction: column; gap: 7px; font-size: 13px; flex: 1; min-width: 0; } .lg span { display: flex; align-items: center; gap: 8px; } .lg i { width: 10px; height: 10px; flex: none; } .lg b { margin-left: auto; font-weight: 600; white-space: nowrap; }
</style>
