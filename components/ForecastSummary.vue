<script setup lang="ts">
// A read-only forecast: headline figures, the chart and (unless compact) the monthly table. Used on shared links and
// on boards.
import { run, defaults, COST_LINES, type Assumptions, type Scenario } from '~/shared/forecast'
const props = withDefaults(defineProps<{ assumptions: Assumptions; compact?: boolean; scenarios?: boolean }>(), { compact: false, scenarios: true })
const sc = ref<Scenario>('base')
const a = computed(() => ({ ...defaults(props.assumptions.start), ...props.assumptions }))
const res = computed(() => run(a.value, sc.value))
const cur = computed(() => a.value.currency)
const m = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, cur.value))
const full = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (v < 0 ? '(' : '') + Math.abs(Math.round(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''))
const mon = (ym: string | null) => (ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const chart = computed(() => res.value.months.map((x) => ({ month: x.month, revenue: x.revenue, costs: x.cogs + x.opex, cash: x.cash })))
type Mo = (typeof res.value.months)[number]
const ROWS: [string, (x: Mo) => number | null, string?][] = [
  ['Revenue', (x) => x.revenue, 'b'], ['Cost of revenue', (x) => -x.cogs], ['Gross profit', (x) => x.gross_profit, 'b'], ['Gross margin %', (x) => x.gross_margin, 'p'],
  ['Payroll', (x) => -x.payroll], ...COST_LINES.map((c) => [c.label, (x: Mo) => -(x.costs[c.key] ?? 0)] as [string, (x: Mo) => number]),
  ['Operating costs', (x) => -x.opex, 'b'], ['EBITDA', (x) => x.ebitda, 'b'], ['Tax', (x) => -x.tax], ['Net income', (x) => x.net_income, 'b'],
  ['One-off items', (x) => x.items], ['Funding', (x) => x.funding], ['Net cash flow', (x) => x.cash_flow, 'b'], ['Cash at month end', (x) => x.cash, 'h'], ['Headcount', (x) => x.headcount, 'n'], ['ARR', (x) => x.arr]]
const fixedRange = computed(() => { const k = Object.keys(a.value.fixed ?? {}).sort(); return k.length ? mon(k[0]!) + ' to ' + mon(k[k.length - 1]!) : '' })
</script>
<template>
  <div class="fs">
    <div v-if="scenarios" class="seg"><button v-for="s in (['base', 'best', 'worst'] as const)" :key="s" :class="{ on: sc === s }" @click="sc = s">{{ s === 'base' ? 'Base case' : s === 'best' ? 'Best case' : 'Worst case' }}</button></div>
    <div class="fx-stats">
      <StatTile label="Cash at the end" :value="m(res.summary.cash_end)" :note="mon(res.months[res.months.length - 1]?.month ?? null)" :red="res.summary.cash_end < 0" />
      <StatTile :label="res.summary.zero_cash ? 'Cash runs out' : 'Lowest cash'" :value="res.summary.zero_cash ? mon(res.summary.zero_cash) : m(res.summary.min_cash)" :note="res.summary.zero_cash ? '' : mon(res.summary.min_cash_month)" :red="!!res.summary.zero_cash" full />
      <StatTile label="Break-even" :value="res.summary.break_even ? mon(res.summary.break_even) : 'Not in this forecast'" note="First month with a profit" full />
      <StatTile label="ARR at the end" :value="m(res.summary.arr_end)" :note="'Revenue ' + m(res.summary.revenue_total) + ' over ' + a.months + ' months'" />
    </div>
    <div class="card"><ForecastChart :actual="[]" :forecast="chart" :currency="cur" /></div>
    <p v-if="fixedRange" class="mut">{{ fixedRange }} uses figures from {{ a.source?.file || 'an imported forecast' }}; later months follow the forecast's assumptions.</p>
    <div v-if="!compact" class="card pad0"><table class="t" data-nosearch><thead><tr><th>{{ cur }}</th><th v-for="x in res.months" :key="x.month" class="r">{{ mon(x.month) }}</th></tr></thead>
      <tbody><tr v-for="[l, f, k] in ROWS" :key="l" :class="k"><td>{{ l }}</td><td v-for="x in res.months" :key="x.month" class="r">{{ k === 'p' ? (f(x) === null ? '—' : f(x) + '%') : k === 'n' ? (f(x) ?? '—') : full(f(x)) }}</td></tr></tbody></table></div>
  </div>
</template>
<style scoped>
.fs { display: flex; flex-direction: column; gap: 16px; min-width: 0; max-width: 100%; } .fs > * { min-width: 0; } .mut { color: var(--c-muted); font-size: 12.5px; margin: 0; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); width: fit-content; } .seg button { background: #fff; border: 0; padding: 7px 14px; font: inherit; font-size: 13px; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 1px solid var(--c-rule-strong); } .seg button.on { background: var(--c-navy); color: #fff; }
.pad0 { padding: 0; overflow-x: auto; } .t { border-collapse: collapse; font-size: 12.5px; width: 100%; } .t th { font-weight: 500; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; white-space: nowrap; text-align: left; } .t td { padding: 6px 10px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; font-variant-numeric: tabular-nums; } .t .r { text-align: right; }
.t td:first-child { position: sticky; left: 0; background: #fff; min-width: 200px; } .t tr.b td { font-weight: 600; } .t tr.h td { background: var(--c-paper-3); font-weight: 600; }
</style>
