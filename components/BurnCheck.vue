<script setup lang="ts">
// Burn and runway, checked several ways (cash flow, cash flow from the balance sheet, fall in cash, net loss) on the last three months, with anything
// that does not add up called out.
import type { BurnReview } from '~/shared/fin-view'
const props = defineProps<{ review: BurnReview; currency: string; withSecurities?: boolean }>()
const open = ref(false)
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const m = (v: number | null) => (v === null ? '—' : (v < 0 ? '−' : '') + (SYM[props.currency] ?? props.currency + ' ') + Math.abs(Math.round(v)).toLocaleString('en-US'))
// Amounts inside the checks' sentences, with the currency: "270,561" → "₦270,561".
const money = (t: string) => t.replace(/(^|[^\d.])(\d{1,3}(?:,\d{3})+)(?![\d.])/g, (_x, pre: string, n: string) => pre + m(Number(n.replace(/,/g, ''))))
const dt = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
</script>

<template>
  <section v-if="review.status !== 'none'" class="bc" :class="review.status">
    <div class="top"><span class="eb">Burn and runway</span><span class="pill">{{ review.status === 'ok' ? 'Checked' : review.issues.length + ' thing' + (review.issues.length === 1 ? '' : 's') + ' to check' }}</span></div>
    <div class="row">
      <div class="k"><span>Monthly burn</span><b>{{ review.profitable ? 'None' : m(review.burn) }}</b><em>{{ review.months }}-month average · {{ review.basis.toLowerCase() }}</em></div>
      <div class="k"><span>Runway</span><b>{{ review.profitable ? 'Cash-flow positive' : review.runway !== null ? review.runway + ' months' : '—' }}</b><em>{{ review.cash !== null ? m(review.cash) + (withSecurities ? ' cash & securities' : ' cash') + ' at ' + dt(review.cash_at) : 'No cash balance in the figures' }}</em></div>
    </div>
    <div v-if="review.issues.length || review.notes.length" class="msgs">
      <p v-for="(x, i) in review.issues" :key="i" class="iss"><i>!</i><span>{{ money(x) }}</span></p>
      <p v-for="(x, i) in review.notes" :key="'n' + i" class="nt"><i>i</i><span>{{ money(x) }}</span></p>
    </div>
    <table v-if="open" class="mt"><tbody><tr v-for="x in review.methods" :key="x.key" :class="{ used: x.label === review.basis }"><td>{{ x.label }}</td><td class="n">{{ x.value === null ? 'Not in the figures' : m(x.value) + ' / month' }}</td><td class="u">{{ x.label === review.basis ? 'Used' : '' }}</td></tr></tbody></table>
    <div class="acts"><button type="button" class="lk" :aria-expanded="open" @click="open = !open">{{ open ? 'Hide how it is worked out' : 'How it is worked out' }}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cv" :class="{ up: open }"><path d="M6 9l6 6 6-6" /></svg></button></div>
  </section>
</template>

<style scoped>
.bc { background: #fff; border: 1px solid var(--c-rule); padding: 16px 20px; margin: 0 0 12px; display: flex; flex-direction: column; gap: 12px; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .eb { font-size: 11.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--c-muted); }
.pill { font-size: 12px; padding: 3px 10px; background: #f0f3f8; color: var(--c-navy); white-space: nowrap; } .check .pill { background: #fbf3e6; color: #8a5a0a; }
.row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.k { display: flex; flex-direction: column; gap: 3px; } .k span { font-size: 12.5px; color: var(--c-muted); } .k b { font-family: var(--font-heading); font-size: 22px; font-weight: 500; color: var(--c-navy); } .k em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.msgs { display: flex; flex-direction: column; gap: 8px; background: var(--c-paper-3); border: 1px solid var(--c-rule); padding: 10px 14px; }
.msgs p { margin: 0; display: flex; gap: 10px; align-items: flex-start; font-size: 13px; line-height: 1.5; color: var(--c-ink-soft); }
.msgs i { flex: none; width: 18px; height: 18px; display: grid; place-items: center; font-style: normal; font-size: 11px; font-weight: 700; color: #fff; margin-top: 1px; } .iss i { background: #b8790f; } .nt i { background: var(--c-blue-deep); }
.mt { width: 100%; border-collapse: collapse; font-size: 13px; } .mt td { padding: 7px 0; border-top: 1px solid var(--c-rule); } .mt .n { text-align: right; } .mt .u { width: 60px; text-align: right; font-size: 12px; color: var(--c-muted); } .mt tr.used td { font-weight: 500; }
.acts { padding-top: 10px; border-top: 1px solid var(--c-rule); } .lk { display: inline-flex; align-items: center; gap: 4px; background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.cv { width: 14px; height: 14px; transition: transform .15s; } .cv.up { transform: rotate(180deg); }
@media (max-width: 640px) { .row { grid-template-columns: 1fr; } }
</style>
