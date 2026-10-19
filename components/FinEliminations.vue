<script setup lang="ts">
// Group figures: what was taken out because the companies owe or bill each other (intercompany), for one period, and
// whether the two sides agree. Categories count as intercompany by name ("Intercompany receivable…", "Due to parent")
// or when the company ticks them in Your categories.
interface El { receivables: number; payables: number; equity: number; unreconciled: number; income: number; costs: number; items: { line: string; name: string; value: number; who: string }[] }
const props = defineProps<{ el: El | null | undefined; period: string; currency: string; totalAssets?: number | null }>()
const emit = defineEmits<{ categories: [] }>()
const m = (v: number) => briefMoney(v, props.currency)
const LINE: Record<string, string> = { receivables: 'Receivables', other_assets: 'Other assets', investments: 'Investments', long_term_investments: 'Long-term investments', cash: 'Cash', payables: 'Payables', debt: 'Debt', other_liabilities: 'Other liabilities', equity: 'Equity', revenue: 'Revenue', other_income: 'Other income', cogs: 'Cost of revenue', opex_payroll: 'Payroll', opex_marketing: 'Marketing', opex_rnd: 'R&D', opex_ga: 'G&A', opex_other: 'Other costs' }
const off = computed(() => !!props.el && Math.abs(props.el.unreconciled) > Math.max(1, Math.abs(props.totalAssets ?? 0) * 0.0005))
const has = computed(() => !!props.el?.items.length)
</script>
<template>
  <div class="card ie">
    <div class="ih"><span class="eyebrow">Intercompany eliminations · {{ period }}</span>
      <button type="button" class="link" @click="emit('categories')">Mark categories as intercompany</button></div>
    <template v-if="has && el">
      <div class="ig">
        <div><span>Owed within the group</span><b>{{ m(el.receivables) }}</b><em>receivables taken out of assets</em></div>
        <div><span>Owing within the group</span><b>{{ m(el.payables) }}</b><em>payables taken out of liabilities</em></div>
        <div><span>Sales between companies</span><b>{{ m(el.income) }}</b><em>taken out of revenue</em></div>
        <div><span>Costs between companies</span><b>{{ m(el.costs) }}</b><em>taken out of costs</em></div>
      </div>
      <p v-if="off" class="warn" role="note"><b>The companies' books do not agree by {{ m(Math.abs(el.unreconciled)) }}.</b> One side records {{ m(el.receivables) }} owed within the group, the other {{ m(el.payables) }}{{ el.equity ? ' (and ' + m(el.equity) + ' in equity)' : '' }}. Until they agree, the difference is taken through group equity. It is usually a payment one company has booked and the other has not, a different exchange rate, or a balance under another name.</p>
      <details><summary>{{ el.items.length }} intercompany item{{ el.items.length === 1 ? '' : 's' }}</summary>
        <table class="t" data-nosearch><thead><tr><th>Company</th><th>Category</th><th>Line</th><th class="r">Amount ({{ currency }})</th></tr></thead>
          <tbody><tr v-for="(x, i) in el.items" :key="i"><td>{{ x.who || '—' }}</td><td>{{ x.name }}</td><td>{{ LINE[x.line] ?? x.line }}</td><td class="r">{{ m(x.value) }}</td></tr></tbody></table></details>
    </template>
    <p v-else class="mut">No intercompany balances or sales found for {{ period }}. Categories named like "Intercompany receivable", "Inter-company payable", "Due from parent" or "Intra-group loan" are taken out automatically; mark any others in Your categories.</p>
  </div>
</template>
<style scoped>
.ie { display: flex; flex-direction: column; gap: 12px; margin: 0 0 14px; } .ih { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.eyebrow { font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
.link { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.ig { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--c-rule); } .ig > div { padding: 10px 14px; border-right: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 2px; } .ig > div:last-child { border-right: 0; }
.ig span { font-size: 13px; font-weight: 500; color: var(--c-muted); } .ig b { font-family: var(--font-heading); font-size: 22px; font-weight: 500; color: var(--c-navy); } .ig em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.warn { margin: 0; padding: 10px 14px; background: #fbf1ef; border: 1px solid #efd3ce; font-size: 13.5px; line-height: 1.55; color: var(--c-ink-soft); } .warn b { color: #9b3b32; font-weight: 500; }
details summary { cursor: pointer; font-size: 13px; color: var(--c-blue-deep); } .t { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; } .t th { text-align: left; font-weight: 500; color: var(--c-muted); padding: 6px 8px; border-bottom: 1px solid var(--c-rule); } .t td { padding: 6px 8px; border-bottom: 1px solid var(--c-rule); } .r { text-align: right; }
.mut { margin: 0; font-size: 13.5px; color: var(--c-muted); line-height: 1.5; }
@media (max-width: 800px) { .ig { grid-template-columns: 1fr 1fr; } .ig > div:nth-child(2) { border-right: 0; } }
</style>
