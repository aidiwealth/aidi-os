<script setup lang="ts">
// An amount with superscript cents: ₦813,818⁶⁵. sign: 'auto' shows minus only, 'always' shows + and −.
// short: $466k, ₦1.5B (summaries, lists); without it the exact amount (statements, invoices, transactions).
const props = withDefaults(defineProps<{ value: number | string | null | undefined; currency?: string; sign?: 'auto' | 'always'; muted?: boolean; short?: boolean }>(), { currency: 'USD', sign: 'auto', muted: false, short: false })
import { compactNum } from '~/shared/compact'
const injected = inject('compactMoney', false)
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€', CAD: 'C$', ZAR: 'R', KES: 'KSh ', GHS: 'GH₵' }
const parts = computed(() => {
  if (props.value === null || props.value === undefined || props.value === '') return null
  const n = Number(props.value), a = Math.abs(n)
  const [i, d] = a.toFixed(2).split('.')
  const compact = injected || props.short
  const c = compact ? compactNum(n) : null
  return { s: n < 0 ? '−' : props.sign === 'always' && n > 0 ? '+' : '', sym: SYM[props.currency] ?? props.currency + ' ', i: c ?? Number(i).toLocaleString('en-US'), d: c || (compact && d === '00') ? '' : d }
})
</script>
<template><span v-if="parts" class="mny" :class="{ muted }">{{ parts.s }}{{ parts.sym }}{{ parts.i }}<sup v-if="parts.d">.{{ parts.d }}</sup></span><span v-else class="mny muted">—</span></template>
<style scoped>
.mny { font-variant-numeric: tabular-nums; white-space: nowrap; } .mny sup { font-size: .55em; vertical-align: .8em; margin-left: 1px; letter-spacing: 0; } .muted { color: var(--c-muted); }
</style>
