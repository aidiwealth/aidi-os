<script setup lang="ts">
// An amount with superscript cents: ₦813,818⁶⁵. sign: 'auto' shows minus only, 'always' shows + and −.
const props = withDefaults(defineProps<{ value: number | string | null | undefined; currency?: string; sign?: 'auto' | 'always'; muted?: boolean }>(), { currency: 'USD', sign: 'auto', muted: false })
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€', CAD: 'C$', ZAR: 'R', KES: 'KSh ', GHS: 'GH₵' }
const parts = computed(() => {
  if (props.value === null || props.value === undefined || props.value === '') return null
  const n = Number(props.value), a = Math.abs(n)
  const [i, d] = a.toFixed(2).split('.')
  return { s: n < 0 ? '−' : props.sign === 'always' && n > 0 ? '+' : '', sym: SYM[props.currency] ?? props.currency + ' ', i: Number(i).toLocaleString('en-US'), d }
})
</script>
<template><span v-if="parts" class="mny" :class="{ muted }">{{ parts.s }}{{ parts.sym }}{{ parts.i }}<sup>.{{ parts.d }}</sup></span><span v-else class="mny muted">—</span></template>
<style scoped>
.mny { font-variant-numeric: tabular-nums; white-space: nowrap; } .mny sup { font-size: .55em; vertical-align: .8em; margin-left: 1px; letter-spacing: 0; } .muted { color: var(--c-muted); }
</style>
