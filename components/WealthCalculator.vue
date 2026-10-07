<script setup lang="ts">
// Growth calculator: starting amount, monthly contribution, expected yearly return and years (illustration only).
const p = reactive({ start: 100000, monthly: 2000, rate: 8, years: 15, fee: 0 })
const rows = computed(() => { const out: { year: number; value: number; paid: number }[] = []; let v = Number(p.start) || 0, paid = v; const r = (Number(p.rate) - Number(p.fee)) / 100 / 12
  for (let y = 1; y <= Math.min(50, Number(p.years) || 0); y++) { for (let m = 0; m < 12; m++) { v = v * (1 + r) + (Number(p.monthly) || 0); paid += Number(p.monthly) || 0 } out.push({ year: y, value: Math.round(v), paid: Math.round(paid) }) } return out })
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
const last = computed(() => rows.value[rows.value.length - 1])
const W = 560, H = 180
const path = computed(() => { const max = Math.max(1, ...rows.value.map((r) => r.value)); return rows.value.map((r, i) => (i ? 'L' : 'M') + ((i / Math.max(1, rows.value.length - 1)) * (W - 20) + 10).toFixed(1) + ' ' + (H - 10 - (r.value / max) * (H - 20)).toFixed(1)).join(' ') })
const paidPath = computed(() => { const max = Math.max(1, ...rows.value.map((r) => r.value)); return rows.value.map((r, i) => (i ? 'L' : 'M') + ((i / Math.max(1, rows.value.length - 1)) * (W - 20) + 10).toFixed(1) + ' ' + (H - 10 - (r.paid / max) * (H - 20)).toFixed(1)).join(' ') })
</script>
<template>
  <div class="card wc"><h3>Wealth calculator</h3>
    <div class="in"><label>Starting amount<input v-model.number="p.start" type="number" min="0"></label><label>Added each month<input v-model.number="p.monthly" type="number" min="0"></label><label>Yearly return %<input v-model.number="p.rate" type="number" step="0.5"></label><label>Yearly fees %<input v-model.number="p.fee" type="number" step="0.1" min="0"></label><label>Years<input v-model.number="p.years" type="number" min="1" max="50"></label></div>
    <div v-if="last" class="res"><div><span>Projected value</span><b>{{ usd(last.value) }}</b></div><div><span>You put in</span><b>{{ usd(last.paid) }}</b></div><div><span>Growth</span><b>{{ usd(last.value - last.paid) }}</b></div></div>
    <svg :viewBox="'0 0 ' + W + ' ' + H" class="sv"><path :d="paidPath" fill="none" stroke="#9aa3ad" stroke-width="2" stroke-dasharray="4 4" /><path :d="path" fill="none" stroke="#1c4f9c" stroke-width="2.6" /></svg>
    <p class="mut">An illustration only, with a steady return and no taxes. Real returns go up and down; this is not a forecast or advice.</p></div>
</template>
<style scoped>
.wc h3 { margin: 0 0 10px; } .in { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; } label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); } input { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); width: 100%; box-sizing: border-box; }
.res { display: flex; gap: 28px; margin: 14px 0 6px; flex-wrap: wrap; } .res span { display: block; font-size: 12.5px; color: var(--c-muted); } .res b { font-size: 22px; } .sv { width: 100%; height: 180px; } .mut { color: var(--c-muted); font-size: 12px; margin: 4px 0 0; }
@media (max-width: 800px) { .in { grid-template-columns: 1fr 1fr; } }
</style>
