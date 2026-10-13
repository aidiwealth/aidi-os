<script setup lang="ts">
// Period picker for the rentals pages: a month (default last month), a quarter or a year. v-model is "2026-09",
// "2026-Q3" or "2026" (and "all" when allowAll is set).
const props = defineProps<{ modelValue: string; allowAll?: boolean; from?: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
const now = new Date(), y = now.getUTCFullYear()
const start = Number((props.from ?? '2025').slice(0, 4))
const lastMonth = (() => { const d = new Date(Date.UTC(y, now.getUTCMonth() - 1, 1)); return d.toISOString().slice(0, 7) })()
const months = computed(() => { const out: string[] = []; const d = new Date(lastMonth + '-01T12:00:00Z'); while (d.getUTCFullYear() >= start) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1) } return out })
const quarters = computed(() => { const out: string[] = []; for (let yy = y; yy >= start; yy--) for (let q = 4; q >= 1; q--) { if (yy === y && (q - 1) * 3 > now.getUTCMonth()) continue; out.push(yy + '-Q' + q) } return out })
const years = computed(() => Array.from({ length: y - start + 1 }, (_, i) => String(y - i)))
const mode = computed(() => (props.modelValue === 'all' ? 'all' : /^\d{4}$/.test(props.modelValue) ? 'year' : /-Q/.test(props.modelValue) ? 'quarter' : 'month'))
function setMode(m: string) {
  const v = props.modelValue, yr = /^\d{4}/.test(v) ? v.slice(0, 4) : String(y)
  if (m === 'month') emit('update:modelValue', lastMonth)
  else if (m === 'quarter') emit('update:modelValue', /^\d{4}-\d{2}$/.test(v) ? v.slice(0, 4) + '-Q' + (Math.floor((Number(v.slice(5, 7)) - 1) / 3) + 1) : quarters.value.find((q) => q.startsWith(yr)) ?? quarters.value[0]!)
  else if (m === 'year') emit('update:modelValue', yr)
  else emit('update:modelValue', 'all')
}
const mlabel = (m: string) => new Date(m + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const qlabel = (q: string) => q.slice(5) + ' ' + q.slice(0, 4) + ' (' + ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][Number(q.slice(6)) - 1] + ')'
</script>
<template>
  <div class="rp">
    <div class="seg" role="group" aria-label="Period"><button v-for="m in (allowAll ? ['month', 'quarter', 'year', 'all'] : ['month', 'quarter', 'year'])" :key="m" type="button" :class="{ on: mode === m }" @click="setMode(m)">{{ { month: 'Month', quarter: 'Quarter', year: 'Year', all: 'All time' }[m] }}</button></div>
    <select v-if="mode === 'month'" :value="modelValue" aria-label="Month" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"><option v-for="m in months" :key="m" :value="m">{{ mlabel(m) }}{{ m === lastMonth ? ' · last month' : '' }}</option></select>
    <select v-else-if="mode === 'quarter'" :value="modelValue" aria-label="Quarter" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"><option v-for="q in quarters" :key="q" :value="q">{{ qlabel(q) }}</option></select>
    <select v-else-if="mode === 'year'" :value="modelValue" aria-label="Year" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"><option v-for="yy in years" :key="yy" :value="yy">{{ yy }}{{ yy === String(y) ? ' (to date)' : '' }}</option></select>
  </div>
</template>
<style scoped>
.rp { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .seg { display: flex; } .seg button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 7px 12px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 0; } .seg .on { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
</style>
