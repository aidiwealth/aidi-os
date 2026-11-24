<script setup lang="ts">
// A read-only forecast: headline figures, the chart and (unless compact) the monthly table. Used on shared links and
// on boards. A group forecast comes worked out already (pack: each company's forecast added up in one currency).
import { run, defaults, forecastRows, type Assumptions, type Scenario, type Result, type Part } from '~/shared/forecast'
const props = withDefaults(defineProps<{ assumptions?: Assumptions | null; pack?: { currency: string; months: number; base: Result; best: Result; worst: Result; cats?: Part[]; lines?: { key: string; label: string }[] } | null; compact?: boolean; scenarios?: boolean }>(), { assumptions: null, pack: null, compact: false, scenarios: true })
const sc = ref<Scenario>('base')
const a = computed(() => (props.assumptions ? { ...defaults(props.assumptions.start), ...props.assumptions } : { ...defaults(props.pack?.base.months[0]?.month ?? new Date().toISOString().slice(0, 7)), currency: props.pack?.currency ?? 'USD', months: props.pack?.months ?? 0 }))
const res = computed(() => (props.pack ? props.pack[sc.value] : run(a.value as Assumptions, sc.value)))
const cur = computed(() => props.pack?.currency ?? a.value.currency)
const m = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, cur.value))
const full = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (v < 0 ? '(' : '') + Math.abs(Math.round(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''))
const mon = (ym: string | null) => (ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const chart = computed(() => res.value.months.map((x) => ({ month: x.month, revenue: x.revenue, costs: x.cogs + x.opex, cash: x.cash })))
// Every line, with the company's own lines (products, carriers, costs) under theirs; ARR and headcount at the end.
// A group forecast has no single set of assumptions: its table is the main lines, added up across the companies.
type Row = { label: string; kind: string; get: (x: Result['months'][number]) => number | null }
const PACK_ROWS: Row[] = [
  { label: 'Revenue', kind: 'b', get: (x) => x.revenue }, { label: 'Cost of revenue', kind: '', get: (x) => x.cogs }, { label: 'Gross profit', kind: 'b', get: (x) => x.gross_profit },
  { label: 'Gross margin %', kind: 'p', get: (x) => (x.revenue ? Math.round((x.gross_profit / x.revenue) * 1000) / 10 : null) }, { label: 'Payroll', kind: '', get: (x) => x.payroll },
  { label: 'Operating costs', kind: '', get: (x) => x.opex }, { label: 'EBITDA', kind: 'b', get: (x) => x.ebitda }, { label: 'Tax', kind: '', get: (x) => x.tax },
  { label: 'Net income', kind: 'b', get: (x) => x.net_income }, { label: 'Funding', kind: '', get: (x) => x.funding }, { label: 'Cash flow', kind: '', get: (x) => x.cash_flow },
  { label: 'Cash at the end', kind: 'h', get: (x) => x.cash }, { label: 'ARR', kind: '', get: (x) => x.arr }, { label: 'Headcount', kind: 'n', get: (x) => x.headcount }]
// A group pack that carries its categories and cost lines gets the full breakdown, as on the group forecast: each
// product, cost line and category under its line (rows that stay at zero left out).
const ROWS = computed<Row[]>(() => {
  if (props.pack && !props.pack.cats) return PACK_ROWS
  const ga = (props.pack ? { costs: props.pack.lines ?? [], parts: props.pack.cats } : a.value) as unknown as Assumptions
  return forecastRows(ga, res.value.months).filter((r) => r.label !== 'Customers' && (r.kind !== 's' || !props.pack || res.value.months.some((x) => Math.abs(r.get(x) ?? 0) > 0.5))) as unknown as Row[]
})
const fixedRange = computed(() => { if (props.pack) return ''; const k = Object.keys(a.value.fixed ?? {}).sort(); return k.length ? mon(k[0]!) + ' to ' + mon(k[k.length - 1]!) : '' })
</script>
<template>
  <div class="fs">
    <div v-if="scenarios" class="seg"><button v-for="s in (['base', 'best', 'worst'] as const)" :key="s" :class="{ on: sc === s }" @click="sc = s">{{ s === 'base' ? 'Base case' : s === 'best' ? 'Best case' : 'Worst case' }}</button></div>
    <div class="fx-stats">
      <StatTile label="Cash at the end" :value="m(res.summary.cash_end)" :note="mon(res.months[res.months.length - 1]?.month ?? null)" :red="res.summary.cash_end < 0" />
      <StatTile :label="res.summary.zero_cash ? 'Cash runs out' : 'Lowest cash'" :value="res.summary.zero_cash ? mon(res.summary.zero_cash) : m(res.summary.min_cash)" :note="res.summary.zero_cash ? '' : mon(res.summary.min_cash_month)" :red="!!res.summary.zero_cash" full />
      <StatTile label="Break-even" :value="res.summary.break_even ? mon(res.summary.break_even) : 'Not in this forecast'" note="First month with a profit" full />
      <StatTile label="ARR at the end" :value="m(res.summary.arr_end)" :note="'Revenue ' + m(res.summary.revenue_total) + ' over ' + res.months.length + ' months'" />
    </div>
    <div class="card"><ForecastChart :actual="[]" :forecast="chart" :currency="cur" /></div>
    <p v-if="fixedRange" class="mut">{{ fixedRange }} uses figures from {{ a.source?.file || 'an imported forecast' }}; later months follow the forecast's assumptions.</p>
    <div v-if="!compact" class="card pad0"><table class="t" data-nosearch><thead><tr><th>{{ cur }}</th><th v-for="x in res.months" :key="x.month" class="r">{{ mon(x.month) }}</th></tr></thead>
      <tbody><tr v-for="(r, i) in ROWS" :key="i" :class="r.kind"><td>{{ r.label }}</td><td v-for="x in res.months" :key="x.month" class="r" :class="{ neg: r.kind !== 'p' && r.kind !== 'n' && (r.get(x) ?? 0) < -0.5 }">{{ r.kind === 'p' ? (r.get(x) === null ? '—' : r.get(x) + '%') : r.kind === 'n' ? (r.get(x) ?? '—') : full(r.get(x)) }}</td></tr></tbody></table></div>
  </div>
</template>
<style scoped>
.fs { display: flex; flex-direction: column; gap: 16px; min-width: 0; max-width: 100%; } .fs > * { min-width: 0; } .mut { color: var(--c-muted); font-size: 12.5px; margin: 0; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); width: fit-content; } .seg button { background: #fff; border: 0; padding: 7px 14px; font: inherit; font-size: 13px; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 1px solid var(--c-rule-strong); } .seg button.on { background: var(--c-navy); color: #fff; }
.pad0 { padding: 0; overflow-x: auto; } .t { border-collapse: collapse; font-size: 12.5px; width: 100%; } .t th { font-weight: 500; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; white-space: nowrap; text-align: left; } .t td { padding: 6px 10px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; font-variant-numeric: tabular-nums; } .t .r { text-align: right; }
.t td:first-child { position: sticky; left: 0; background: #fff; min-width: 200px; } .t tr.b td { font-weight: 600; } .t tr.h td { background: var(--c-paper-3); font-weight: 600; }
.t tr.s td { color: var(--c-muted); font-size: 12px; } .t tr td.neg { color: var(--c-danger); } .t tr.s td:first-child { padding-left: 24px; color: var(--c-ink-soft); }
</style>
