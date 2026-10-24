<script setup lang="ts">
// The group forecast: each company's forecast (the one it marks "used for the group", else its newest), converted to
// the reporting currency at one plan rate per currency and added together month by month. Money moving between the
// companies (one company's settlement out, the other's in) cancels out when both forecasts carry it. Read only: each
// company's forecast is built, imported and changed on that company.
import { run, type Scenario, type GroupCo } from '~/shared/forecast'
const props = defineProps<{ data: { currency: string; name: string; companies: GroupCo[] }; canEdit: boolean }>()
const emit = defineEmits<{ open: [id: string]; refresh: [] }>()
const sc = ref<Scenario>('base'), msg = ref(''), ok = ref('')
const cur = computed(() => props.data.currency)
// One rate per currency: units of that currency for one unit of the reporting currency.
const rates = reactive<Record<string, number | null>>({})
watch(() => props.data.companies, (cs) => { for (const c of cs) if (c.currency !== cur.value) rates[c.currency] = c.per }, { immediate: true })
const perOf = (c: GroupCo) => (c.currency === cur.value ? 1 : rates[c.currency] ?? null)
const runs = computed(() => props.data.companies.filter((c) => c.use).map((c) => ({ c, per: perOf(c), a: c.use!.assumptions, r: run(c.use!.assumptions, sc.value) })))
const missingRate = computed(() => runs.value.filter((x) => !x.per).map((x) => x.c))
const ready = computed(() => runs.value.filter((x) => x.per))
// The months every forecast covers: from the earliest start to the earliest end. Before a company's forecast starts,
// its cash is its opening cash and it adds no revenue or costs.
const months = computed(() => {
  const rs = ready.value; if (!rs.length) return [] as string[]
  const end = rs.map((x) => x.r.months[x.r.months.length - 1]?.month ?? '').sort()[0]!
  const all = [...new Set(rs.flatMap((x) => x.r.months.map((m) => m.month)))].sort()
  return all.filter((m) => m <= end)
})
const lateStart = computed(() => ready.value.filter((x) => months.value.length && x.a.start > months.value[0]!).map((x) => x.c.name))
const shortEnd = computed(() => { const rs = ready.value; if (rs.length < 2) return null; const ends = rs.map((x) => x.r.months[x.r.months.length - 1]?.month ?? ''); return ends.some((e) => e !== ends[0]) ? months.value[months.value.length - 1] ?? null : null })
interface GM { month: string; revenue: number; cogs: number; gross: number; payroll: number; other: number; opex: number; ebitda: number; tax: number; net: number; items: number; funding: number; flow: number; cash: number; customers: number | null; headcount: number; arr: number; by: Record<string, { revenue: number; net: number; cash: number }> }
const g = computed<GM[]>(() => months.value.map((m) => {
  const o: GM = { month: m, revenue: 0, cogs: 0, gross: 0, payroll: 0, other: 0, opex: 0, ebitda: 0, tax: 0, net: 0, items: 0, funding: 0, flow: 0, cash: 0, customers: null, headcount: 0, arr: 0, by: {} }
  for (const { c, per, a, r } of ready.value) {
    const k = 1 / per!, x = r.months.find((y) => y.month === m)
    if (!x) { const cash = a.opening.cash * k; o.cash += cash; o.by[c.id] = { revenue: 0, net: 0, cash }; continue }
    o.revenue += x.revenue * k; o.cogs += x.cogs * k; o.payroll += x.payroll * k; o.opex += x.opex * k; o.tax += x.tax * k; o.net += x.net_income * k
    o.items += x.items * k; o.funding += x.funding * k; o.flow += x.cash_flow * k; o.cash += x.cash * k; o.headcount += x.headcount
    if (x.customers !== null) o.customers = (o.customers ?? 0) + x.customers
    o.by[c.id] = { revenue: x.revenue * k, net: x.net_income * k, cash: x.cash * k }
  }
  o.gross = o.revenue - o.cogs; o.other = o.opex - o.payroll; o.ebitda = o.gross - o.opex; o.arr = o.revenue * 12
  return o
}))
const sum = computed(() => {
  const ms = g.value, last = ms[ms.length - 1]
  if (!last) return null
  const zero = ms.find((x) => x.cash < 0), be = ms.find((x) => x.net >= 0 && x.revenue > 0), min = ms.reduce((a, x) => (x.cash < a.cash ? x : a), ms[0]!)
  return { cash_end: last.cash, zero: zero?.month ?? null, min: min.cash, min_month: min.month, be: be?.month ?? null, arr: last.arr, revenue: ms.reduce((s, x) => s + x.revenue, 0), end: last.month }
})
const m = (v: number | null | undefined, c = cur.value) => (v === null || v === undefined ? '—' : briefMoney(v, c))
const full = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (v < 0 ? '(' : '') + Math.abs(Math.round(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''))
const mon = (ym: string | null) => (ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const chart = computed(() => g.value.map((x) => ({ month: x.month, revenue: x.revenue, costs: x.cogs + x.opex, cash: x.cash })))
const ROWS: [string, (x: GM) => number | null, string?][] = [['Revenue', (x) => x.revenue, 'b'], ['Cost of revenue', (x) => -x.cogs], ['Gross profit', (x) => x.gross, 'b'], ['Gross margin %', (x) => (x.revenue ? Math.round(x.gross / x.revenue * 1000) / 10 : null), 'p'],
  ['Payroll', (x) => -x.payroll], ['Other operating costs', (x) => -x.other], ['Operating costs', (x) => -x.opex, 'b'], ['EBITDA', (x) => x.ebitda, 'b'], ['Tax', (x) => -x.tax], ['Net income', (x) => x.net, 'b'],
  ['One-off items', (x) => x.items], ['Funding', (x) => x.funding], ['Net cash flow', (x) => x.flow, 'b'], ['Cash at month end', (x) => x.cash, 'h'], ['Customers', (x) => x.customers, 'n'], ['Headcount', (x) => x.headcount, 'n'], ['ARR', (x) => x.arr]]
const SRC: Record<string, string> = { plan: 'plan rate', book: 'latest book rate', daily: "today's rate", none: 'no rate yet', same: '' }
const curs = computed(() => [...new Set(props.data.companies.filter((c) => c.currency !== cur.value).map((c) => c.currency))])
const srcOf = (q: string) => props.data.companies.find((c) => c.currency === q)?.rate_source ?? 'none'
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function saveRate(q: string) {
  msg.value = ''; ok.value = ''
  try { await $fetch('/api/forecast', { method: 'POST', query: { cust: 'group' }, body: { rates: { [q]: rates[q] ?? 0 } } }); ok.value = 'Plan rate saved: ' + q + ' ' + (rates[q] ?? 0).toLocaleString('en-US') + ' = 1 ' + cur.value + '.'; emit('refresh') } catch (e) { msg.value = err(e) }
}
async function useFc(c: GroupCo, id: string) {
  msg.value = ''; ok.value = ''
  try { await $fetch('/api/forecast', { method: 'POST', query: { cust: c.id }, body: { id, main: true } }); emit('refresh') } catch (e) { msg.value = err(e) }
}
function csv() {
  const head = ['Line (' + cur.value + ')', ...g.value.map((x) => x.month)]
  const rows = [head, ...ROWS.map(([l, f]) => [l, ...g.value.map((x) => { const v = f(x); return v === null ? '' : String(Math.round(v * 100) / 100) })]),
    ...ready.value.flatMap(({ c }) => [['Revenue: ' + c.name, ...g.value.map((x) => String(Math.round((x.by[c.id]?.revenue ?? 0) * 100) / 100))], ['Cash: ' + c.name, ...g.value.map((x) => String(Math.round((x.by[c.id]?.cash ?? 0) * 100) / 100))]])]
  const blob = new Blob([rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')], { type: 'text/csv' })
  const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = props.data.name + ' group forecast (' + sc.value + ').csv'; a.click(); URL.revokeObjectURL(u)
}
</script>

<template>
  <div class="gf">
    <p class="lead">Each company's forecast in {{ cur }}, added together.</p>
    <div class="card pad0"><table class="t sm co" data-nosearch><thead><tr><th>Company</th><th>Forecast used</th><th>Months</th><th>Cash at the end</th><th /></tr></thead>
      <tbody><tr v-for="c in data.companies" :key="c.id">
        <td><b>{{ c.name }}</b><span class="mut"> · {{ c.currency }}</span></td>
        <td v-if="c.use"><select v-if="c.forecasts.length > 1 && canEdit" :value="c.use.id" :aria-label="'Forecast used for ' + c.name" @change="useFc(c, ($event.target as HTMLSelectElement).value)"><option v-for="f in c.forecasts" :key="f.id" :value="f.id">{{ f.name }}</option></select><span v-else>{{ c.use.name }}</span></td>
        <td v-else class="mut">No forecast yet</td>
        <td>{{ c.use ? mon(c.use.assumptions.start) + ' · ' + c.use.assumptions.months : '—' }}</td>
        <td>{{ c.use ? m(runs.find((x) => x.c.id === c.id)?.r.summary.cash_end, c.currency) : '—' }}</td>
        <td class="r"><button type="button" class="lk" @click="emit('open', c.id)">{{ c.use ? 'Open' : 'Build or import' }}</button></td></tr></tbody></table></div>
    <div v-if="curs.length" class="rates">
      <span class="kl">Plan rates</span>
      <label v-for="q in curs" :key="q"><span>{{ q }} per 1 {{ cur }}</span><input v-model.number="rates[q]" type="number" min="0" step="any" :disabled="!canEdit"><em>{{ SRC[srcOf(q)] }}</em><button v-if="canEdit" type="button" class="lk" @click="saveRate(q)">Save</button></label>
      <span class="hint">One rate for every month. Your latest book rate by default.</span>
    </div>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>
    <p v-if="!runs.length" class="note">No company has a forecast yet. Open a company to build one.</p>
    <p v-else-if="missingRate.length" class="note">Set a plan rate for {{ missingRate.map((c) => c.currency).join(', ') }} to add {{ missingRate.map((c) => c.name).join(', ') }} to the group.</p>
    <template v-if="sum && months.length">
      <div class="tb"><div class="seg" role="tablist"><button v-for="s in (['base', 'best', 'worst'] as const)" :key="s" :class="{ on: sc === s }" @click="sc = s">{{ s === 'base' ? 'Base case' : s === 'best' ? 'Best case' : 'Worst case' }}</button></div><span class="sp" /><button class="btn secondary" @click="csv">Export CSV</button></div>
      <div class="fx-stats">
        <StatTile label="Group cash at the end" :value="m(sum.cash_end)" :note="mon(sum.end)" :red="sum.cash_end < 0" />
        <StatTile :label="sum.zero ? 'Group cash runs out' : 'Lowest group cash'" :value="sum.zero ? mon(sum.zero) : m(sum.min)" :note="sum.zero ? 'Raise or cut before then' : mon(sum.min_month)" :red="!!sum.zero" full />
        <StatTile label="Group break-even" :value="sum.be ? mon(sum.be) : 'Not in this forecast'" note="First month with a group profit" full />
        <StatTile label="Group ARR at the end" :value="m(sum.arr)" :note="'Revenue ' + m(sum.revenue) + ' over ' + months.length + ' months'" />
      </div>
      <div class="card"><ForecastChart :actual="[]" :forecast="chart" :currency="cur" /></div>
      <p v-if="lateStart.length || shortEnd" class="fine">{{ lateStart.length ? lateStart.join(', ') + (lateStart.length === 1 ? '\'s forecast starts' : '\'s forecasts start') + ' later: until then it counts its opening cash only. ' : '' }}{{ shortEnd ? 'The group runs to ' + mon(shortEnd) + ', where the shortest forecast ends.' : '' }}</p>
      <div class="card pad0"><div class="tw"><table class="t" data-nosearch><thead><tr><th class="st">{{ cur }}</th><th v-for="x in g" :key="x.month">{{ mon(x.month) }}</th></tr></thead>
        <tbody><tr v-for="[l, f, k] in ROWS" :key="l" :class="k"><td class="st">{{ l }}</td><td v-for="x in g" :key="x.month" :class="{ neg: (f(x) ?? 0) < 0 }">{{ k === 'p' ? (f(x) === null ? '—' : f(x) + '%') : k === 'n' ? (f(x) ?? '—') : full(f(x)) }}</td></tr>
          <tr class="sub"><td class="st">By company</td><td :colspan="g.length" /></tr>
          <template v-for="{ c } in ready" :key="c.id"><tr><td class="st">Revenue · {{ c.name }}</td><td v-for="x in g" :key="x.month">{{ full(x.by[c.id]?.revenue) }}</td></tr>
            <tr><td class="st">Net income · {{ c.name }}</td><td v-for="x in g" :key="x.month" :class="{ neg: (x.by[c.id]?.net ?? 0) < 0 }">{{ full(x.by[c.id]?.net) }}</td></tr>
            <tr><td class="st">Cash · {{ c.name }}</td><td v-for="x in g" :key="x.month" :class="{ neg: (x.by[c.id]?.cash ?? 0) < 0 }">{{ full(x.by[c.id]?.cash) }}</td></tr></template></tbody></table></div></div>
      <p class="fine">Money between the companies cancels out. A forecast is an estimate from the assumptions entered, not a promise of results. Figures in {{ cur }}.</p>
    </template>
  </div>
</template>

<style scoped>
.gf { display: flex; flex-direction: column; gap: 16px; }
.lead { margin: 0; color: var(--c-muted); font-size: 14px; } .mut { color: var(--c-muted); }
.t.co td, .t.co th { text-align: left; } .t.co td.r { text-align: right; } .co select { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--c-rule-strong); background: #fff; max-width: 260px; }
.rates { display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center; padding: 12px 14px; background: #fff; border: 1px solid var(--c-rule); font-size: 13px; }
.rates label { display: flex; align-items: center; gap: 8px; } .rates input { width: 110px; font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--c-rule-strong); } .rates em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.kl { font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); } .hint { font-size: 12px; color: var(--c-muted); flex-basis: 100%; }
.tb { display: flex; gap: 8px; align-items: center; } .sp { flex: 1; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); width: fit-content; } .seg button { font: inherit; font-size: 13px; padding: 7px 14px; background: #fff; border: 0; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 1px solid var(--c-rule-strong); } .seg button.on { background: var(--c-navy); color: #fff; }
.note { margin: 0; padding: 10px 14px; background: #fff; border: 1px solid var(--c-rule); color: var(--c-ink-soft); font-size: 13.5px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.pad0 { padding: 0; } .tw { overflow-x: auto; }
.t { border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; width: max-content; min-width: 100%; } .t th { font-weight: 500; color: var(--c-muted); text-align: right; padding: 9px 10px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; background: #fbfaf7; }
.t td { text-align: right; padding: 6px 10px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; color: var(--c-ink-soft); } .t .st { position: sticky; left: 0; background: #fff; text-align: left; min-width: 210px; color: var(--c-ink); z-index: 1; } .t th.st { background: #fbfaf7; }
.t tr.b td { font-weight: 600; color: var(--c-ink); } .t tr.h td { font-weight: 600; color: var(--c-navy); background: #f4f6f9; } .t tr.h td.st { background: #f4f6f9; } .t td.neg { color: var(--c-danger); }
.t tr.sub td { font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); padding-top: 14px; }
.t.sm { width: 100%; } .fine { margin: 0; font-size: 12px; color: var(--c-muted); }
</style>
