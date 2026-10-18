<script setup lang="ts">
// Burn and runway, checked three ways (cash flow, fall in cash, net loss) on the last three months, with anything
// that does not add up called out.
import type { BurnReview } from '~/shared/fin-view'
const props = defineProps<{ review: BurnReview; currency: string; withSecurities?: boolean }>()
const open = ref(false)
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const m = (v: number | null) => (v === null ? '—' : (v < 0 ? '−' : '') + (SYM[props.currency] ?? props.currency + ' ') + Math.abs(Math.round(v)).toLocaleString('en-US'))
const dt = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
</script>

<template>
  <section v-if="review.status !== 'none'" class="bc" :class="review.status">
    <div class="row">
      <div class="k"><span>Monthly burn</span><b>{{ review.profitable ? 'None' : m(review.burn) }}</b><em>{{ review.months }}-month average · {{ review.basis.toLowerCase() }}</em></div>
      <div class="k"><span>Runway</span><b>{{ review.profitable ? 'Cash-flow positive' : review.runway !== null ? review.runway + ' months' : '—' }}</b><em>{{ review.cash !== null ? m(review.cash) + (withSecurities ? ' cash & securities' : ' cash') + ' at ' + dt(review.cash_at) : 'No cash balance in the figures' }}</em></div>
      <div class="st"><span class="pill">{{ review.status === 'ok' ? 'Checked: the methods agree' : review.issues.length + ' thing' + (review.issues.length === 1 ? '' : 's') + ' to check' }}</span><button type="button" class="lk" @click="open = !open">{{ open ? 'Hide' : 'How it is worked out' }}</button></div>
    </div>
    <ul v-if="review.issues.length" class="is"><li v-for="(x, i) in review.issues" :key="i">{{ x }}</li></ul>
    <table v-if="open" class="mt"><tbody><tr v-for="x in review.methods" :key="x.key" :class="{ used: x.label === review.basis }"><td>{{ x.label }}</td><td class="n">{{ x.value === null ? 'Not in the figures' : m(x.value) + ' / month' }}</td><td class="u">{{ x.label === review.basis ? 'Used' : '' }}</td></tr></tbody></table>
  </section>
</template>

<style scoped>
.bc { background: #fff; border: 1px solid var(--c-rule); padding: 14px 18px; margin: 0 0 12px; }
.row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 18px; align-items: center; }
.k { display: flex; flex-direction: column; gap: 2px; } .k span { font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); } .k b { font-size: 18px; font-weight: 500; color: var(--c-navy); } .k em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.st { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; } .pill { font-size: 12px; padding: 3px 10px; background: #f0f3f8; color: var(--c-navy); white-space: nowrap; } .check .pill { background: #fff6e6; color: #8a5a0a; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; }
.is { margin: 10px 0 0; padding: 0 0 0 18px; font-size: 13px; color: var(--c-ink-soft); display: flex; flex-direction: column; gap: 4px; }
.mt { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; } .mt td { padding: 7px 0; border-top: 1px solid var(--c-rule); } .mt .n { text-align: right; } .mt .u { width: 60px; text-align: right; font-size: 12px; color: var(--c-muted); } .mt tr.used td { font-weight: 500; }
@media (max-width: 760px) { .row { grid-template-columns: 1fr; } .st { align-items: flex-start; } }
</style>
