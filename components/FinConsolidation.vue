<script setup lang="ts">
// The consolidated group for one month, laid out like a consolidation schedule: each company in the group currency
// (at the rate shown), the eliminations, and the group. The eliminations column is the group less the companies
// added up, so the three always agree.
import { deriveLines } from '~/shared/fin-view'
interface Use { quote: string; month: string; per_usd: number; source: 'book' | 'book_near' | 'history' | 'daily'; from_month?: string }
interface Part { who: string; currency: string; rate: number; uses: Use[]; lines: Record<string, number> }
interface Row { period_end: string; lines: Record<string, number>; parts?: Part[]; left_out?: string[]; eliminated?: { unreconciled: number } }
const props = defineProps<{ rows: Row[]; currency: string; name: string; canEdit: boolean }>()
const emit = defineEmits<{ rates: [] }>()
const withParts = computed(() => props.rows.filter((r) => r.parts?.length))
const month = ref('')
watch(withParts, (w) => { if (w.length && !w.some((r) => r.period_end === month.value)) month.value = w[w.length - 1]!.period_end }, { immediate: true })
const row = computed(() => withParts.value.find((r) => r.period_end === month.value) ?? null)
const mon = (d: string, long = true) => new Date(d.slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' })
const LINES: { k: string; l: string; total?: boolean; sec?: string }[] = [
  { k: 'revenue', l: 'Revenue', sec: 'Profit and loss (the month)' }, { k: 'cogs', l: 'Cost of revenue' }, { k: 'gross_profit', l: 'Gross profit', total: true }, { k: 'opex_total', l: 'Operating costs' },
  { k: 'ebitda', l: 'EBITDA', total: true }, { k: 'net_income', l: 'Net income', total: true },
  { k: 'cash', l: 'Cash', sec: 'Balance sheet (end of the month)' }, { k: 'investments', l: 'Short-term investments' }, { k: 'receivables', l: 'Receivables' }, { k: 'other_assets', l: 'Other assets' }, { k: 'long_term_investments', l: 'Long-term investments' },
  { k: 'total_assets', l: 'Total assets', total: true }, { k: 'payables', l: 'Payables' }, { k: 'debt', l: 'Debt' }, { k: 'other_liabilities', l: 'Other liabilities' },
  { k: 'total_liabilities', l: 'Total liabilities', total: true }, { k: 'equity', l: 'Equity', total: true }]
const d = (l: Record<string, number>) => deriveLines(l, 1)
const cols = computed(() => (row.value?.parts ?? []).map((p) => ({ ...p, v: d(p.lines) })))
const grp = computed(() => (row.value ? d(row.value.lines) : {}))
const shown = computed(() => LINES.filter((x) => grp.value[x.k] != null || cols.value.some((c) => c.v[x.k] != null)))
const elim = (k: string) => { const g = grp.value[k]; if (g == null) return null; const s = cols.value.reduce((t, c) => t + (c.v[k] ?? 0), 0); const e = g - s; return Math.abs(e) < 0.5 ? 0 : e }
const anyElim = computed(() => shown.value.some((x) => (elim(x.k) ?? 0) !== 0))
const m = (v: number | null | undefined) => (v == null ? '—' : briefMoney(v, props.currency))
const full = (v: number | null | undefined) => (v == null ? '—' : (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('en-US'))
const SRC: Record<Use['source'], string> = { book: 'book rate', book_near: 'your nearest book rate', history: 'daily rate recorded that month', daily: "today's daily rate" }
const rateText = (u: Use) => u.quote + ' ' + u.per_usd.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' per $1 · ' + SRC[u.source] + (u.source === 'book_near' && u.from_month ? ' (' + mon(u.from_month + '-01', false) + ')' : '')
const weak = computed(() => cols.value.some((c) => c.uses.some((u) => u.source !== 'book')))
const kpi = computed(() => { const g = grp.value; return [['Revenue', g.revenue], ['Net income', g.net_income], ['Cash and short-term investments', (g.cash ?? 0) + (g.investments ?? 0) || null], ['Total assets', g.total_assets], ['Total liabilities', g.total_liabilities], ['Equity', g.equity]] as [string, number | null | undefined][] })
</script>

<template>
  <div v-if="row" class="card cs">
    <div class="ch"><div><span class="eyebrow">Consolidated · {{ currency }}</span><h2>{{ name }}, {{ mon(row.period_end) }}</h2>
      <p class="mut">The {{ cols.length }} companies added together after taking out what they owe and bill each other.</p></div>
      <div class="tools"><select v-model="month" aria-label="Month"><option v-for="r in [...withParts].reverse()" :key="r.period_end" :value="r.period_end">{{ mon(r.period_end) }}</option></select>
        <button type="button" class="btn secondary sm" @click="emit('rates')">Exchange rates</button></div></div>
    <div class="kp"><div v-for="[l, v] in kpi" :key="l"><span>{{ l }}</span><b :class="{ neg: (v ?? 0) < 0 }">{{ m(v) }}</b></div></div>
    <div class="tw"><table class="t" data-nosearch>
      <thead><tr><th>{{ currency }}</th><th v-for="c in cols" :key="c.who" class="r">{{ c.who }}<em>{{ c.currency }}{{ c.currency !== currency ? ' → ' + currency : '' }}</em></th><th v-if="anyElim" class="r">Eliminations</th><th class="r g">Group</th></tr></thead>
      <tbody><template v-for="x in shown" :key="x.k">
        <tr v-if="x.sec" class="sec"><td :colspan="cols.length + (anyElim ? 3 : 2)">{{ x.sec }}</td></tr>
        <tr :class="{ tot: x.total }"><td>{{ x.l }}</td><td v-for="c in cols" :key="c.who" class="r" :class="{ neg: (c.v[x.k] ?? 0) < 0 }">{{ full(c.v[x.k]) }}</td>
          <td v-if="anyElim" class="r el">{{ elim(x.k) ? full(elim(x.k)) : '' }}</td><td class="r g" :class="{ neg: (grp[x.k] ?? 0) < 0 }">{{ full(grp[x.k]) }}</td></tr>
      </template></tbody></table></div>
    <div class="rt" :class="{ weak }"><b>Rates used for {{ mon(row.period_end) }}:</b>
      <span v-for="c in cols.filter((x) => x.uses.length)" :key="c.who">{{ c.who }}: {{ c.uses.map(rateText).join(', ') }}</span>
      <span v-if="!cols.some((x) => x.uses.length)">every company reports in {{ currency }}.</span>
      <template v-if="weak"> Add your book rates so every month converts at the rate in your books.<button v-if="canEdit" type="button" class="lk" @click="emit('rates')">Add book rates</button></template></div>
    <p v-if="row.left_out?.length" class="warn">Not included for {{ mon(row.period_end) }}: {{ row.left_out.join(', ') }} (no exchange rate).</p>
  </div>
</template>

<style scoped>
.cs { display: flex; flex-direction: column; gap: 14px; margin: 0 0 14px; } .ch { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.eyebrow { font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); } .ch h2 { margin: 4px 0 2px; font-size: var(--type-title, 19px); font-weight: 500; color: var(--c-navy); }
.mut { margin: 0; font-size: 13.5px; color: var(--c-muted); } .tools { display: flex; gap: 8px; align-items: center; } .tools select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.kp { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border: 1px solid var(--c-rule); } .kp > div { padding: 10px 14px; border-right: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 2px; } .kp > div:last-child { border-right: 0; }
.kp span { font-size: 12.5px; font-weight: 500; color: var(--c-muted); } .kp b { font-family: var(--font-heading); font-size: 22px; font-weight: 500; color: var(--c-navy); } .kp b.neg { color: #9b3b32; }
.tw { overflow-x: auto; } .t { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; }
.t th { text-align: left; font-weight: 500; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule-strong); vertical-align: bottom; } .t th em { display: block; font-style: normal; font-size: 11.5px; font-weight: 400; }
.t td { padding: 6px 10px; border-bottom: 1px solid var(--c-rule); } .r { text-align: right; white-space: nowrap; } .neg { color: #9b3b32; }
.t .g { background: #f5f7fb; color: var(--c-navy); } .t th.g { color: var(--c-navy); } .tot td { font-weight: 500; } .el { color: var(--c-ink-soft); }
.sec td { padding: 12px 10px 6px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); border-bottom: 1px solid var(--c-rule-strong); }
.rt { font-size: 13px; color: var(--c-ink-soft); line-height: 1.6; display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; } .rt b { font-weight: 500; } .rt.weak { padding: 10px 14px; background: #fbf6ee; border: 1px solid #ecdcc0; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; margin-left: 6px; }
.warn { margin: 0; font-size: 13px; color: #9b3b32; }
@media (max-width: 900px) { .kp { grid-template-columns: repeat(2, minmax(0, 1fr)); } .kp > div:nth-child(2n) { border-right: 0; } }
</style>
