<script setup lang="ts">
// Finvry forecast: revenue, costs, profit, cash and runway by month, from your actuals and a few assumptions.
import { run, defaults, addMonths, COST_LINES, type Assumptions, type Scenario } from '~/shared/forecast'
useHead({ title: 'Forecast' })
interface Act { month: string; revenue: number | null; cogs: number | null; opex: number | null; net_income: number | null; cash: number | null }
const { data, refresh } = await useFetch<{ currency: string; actuals: Act[]; seed: Assumptions; forecasts: { id: string; name: string; updated_at: string; start: string; months: number; views: number; links: number }[]; has_actuals: boolean }>('/api/forecast')
const sel = ref(''), name = ref('Base plan'), a = ref<Assumptions>(structuredClone(toRaw(data.value?.seed ?? defaults(new Date().toISOString().slice(0, 7)))))
const sc = ref<Scenario>('base'), msg = ref(''), ok = ref(''), busy = ref(false), dirty = ref(false)
watch(a, () => { dirty.value = true }, { deep: true })
async function pick(id: string) {
  sel.value = id; msg.value = ''; ok.value = ''
  if (!id) { a.value = structuredClone(toRaw(data.value!.seed)); name.value = 'New forecast'; await nextTick(); dirty.value = false; return }
  const f = await $fetch<{ name: string; assumptions: Assumptions }>('/api/forecast/' + id); name.value = f.name; a.value = { ...defaults(f.assumptions.start), ...f.assumptions }; await nextTick(); dirty.value = false
}
const route = useRoute()
const want = String(route.query.f ?? '')
if (data.value?.forecasts.length) await pick(data.value.forecasts.find((f) => f.id === want)?.id ?? data.value.forecasts[0]!.id)
const imp = ref(false), shareOpen = ref(route.query.share === '1' && !!sel.value)
const cur0 = computed(() => data.value?.forecasts.find((f) => f.id === sel.value))
watch(sel, (id) => { useRouter().replace({ query: id ? { f: id } : {} }) })
async function imported(v: { name: string; assumptions: Assumptions }) {
  imp.value = false; msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/forecast', { method: 'POST', body: { name: v.name, assumptions: v.assumptions } }); await refresh(); await pick(r.id); ok.value = 'Imported and saved as "' + v.name + '".' }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save the imported forecast.' }
}
function dropFixed() { if (!confirm('Stop using the imported figures? Every month will follow the assumptions. (Save to keep this change.)')) return; const x = { ...a.value }; delete x.fixed; delete x.source; a.value = x }
const res = computed(() => run(a.value, sc.value))
const cur = computed(() => a.value.currency)
const m = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, cur.value))
const full = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (v < 0 ? '(' : '') + Math.abs(Math.round(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''))
const mon = (ym: string | null) => (ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
async function save(asNew = false) {
  busy.value = true; msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ id: string }>('/api/forecast', { method: 'POST', body: { id: asNew ? undefined : sel.value || undefined, name: name.value, assumptions: a.value } }); sel.value = r.id; dirty.value = false; ok.value = 'Saved.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
async function del() { if (!sel.value || !confirm('Delete "' + name.value + '"?')) return; await $fetch('/api/forecast', { method: 'POST', body: { id: sel.value, delete: true } }); await refresh(); await pick(data.value?.forecasts[0]?.id ?? '') }
function reseed() { if (!confirm('Reset the starting point to your latest actuals?')) return; const s = data.value!.seed; a.value.opening = { ...s.opening }; a.value.start = s.start; a.value.cogs_pct = s.cogs_pct; a.value.costs = structuredClone(toRaw(s.costs)) }
const addHire = () => a.value.hires.push({ role: '', start: addMonths(a.value.start, 1), monthly_cost: 0 })
const addFund = () => a.value.funding.push({ label: 'Seed round', month: addMonths(a.value.start, 3), amount: 0 })
const addItem = () => a.value.items.push({ label: '', month: addMonths(a.value.start, 1), amount: 0 })
const open = reactive<Record<string, boolean>>({ start: true, revenue: true, costs: true, people: false, money: false, scen: false })
// Chart: last 12 actual months then the forecast.
const chart = computed(() => ({ actual: (data.value?.actuals ?? []).filter((x) => x.month < a.value.start).map((x) => ({ month: x.month, revenue: x.revenue ?? 0, costs: (x.cogs ?? 0) + (x.opex ?? 0), cash: x.cash })), forecast: res.value.months.map((x) => ({ month: x.month, revenue: x.revenue, costs: x.cogs + x.opex, cash: x.cash })) }))
// Actuals against this forecast, for months that have both.
const vs = computed(() => (data.value?.actuals ?? []).map((x) => ({ x, f: res.value.months.find((y) => y.month === x.month) })).filter((p) => p.f && p.x.revenue !== null))
const ROWS: [string, (x: (typeof res.value.months)[number]) => number | null, string?][] = [
  ['Revenue', (x) => x.revenue, 'b'], ['Cost of revenue', (x) => -x.cogs], ['Gross profit', (x) => x.gross_profit, 'b'], ['Gross margin %', (x) => x.gross_margin, 'p'],
  ['Payroll', (x) => -x.payroll], ...COST_LINES.map((c) => [c.label, (x: (typeof res.value.months)[number]) => -(x.costs[c.key] ?? 0)] as [string, (x: (typeof res.value.months)[number]) => number]),
  ['Operating costs', (x) => -x.opex, 'b'], ['EBITDA', (x) => x.ebitda, 'b'], ['Tax', (x) => -x.tax], ['Net income', (x) => x.net_income, 'b'],
  ['One-off items', (x) => x.items], ['Funding', (x) => x.funding], ['Net cash flow', (x) => x.cash_flow, 'b'], ['Cash at month end', (x) => x.cash, 'h'],
  ['Customers', (x) => x.customers, 'n'], ['Headcount', (x) => x.headcount, 'n'], ['ARR', (x) => x.arr]]
function csv() {
  const head = ['Line', ...res.value.months.map((x) => x.month)]
  const lines = [head, ...ROWS.map(([l, f]) => [l, ...res.value.months.map((x) => { const v = f(x); return v === null ? '' : String(Math.round(v * 100) / 100) })])]
  const blob = new Blob([lines.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')], { type: 'text/csv' })
  const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = (name.value || 'forecast') + ' (' + sc.value + ').csv'; l.click(); URL.revokeObjectURL(u)
}
</script>
<template>
  <section v-if="data" class="fc">
    <div class="hd"><div><p class="label">Company</p><h1>Forecast</h1><p class="lead">Revenue, costs, profit and cash by month, starting from your latest actuals. Keep as many forecasts as you need, import your accountant's, and share any of them with a private link.</p></div>
      <div class="tb"><button class="btn secondary" @click="imp = true">Import from accountant</button><button class="btn secondary" @click="pick('')">New forecast</button></div></div>
    <nav class="ft"><button v-for="f in data.forecasts" :key="f.id" :class="{ on: sel === f.id }" @click="pick(f.id)">{{ f.name }}<span v-if="f.views" class="vw">{{ f.views }} view{{ f.views === 1 ? '' : 's' }}</span></button><button v-if="!sel" class="on">{{ name || 'New forecast' }} <span class="vw">not saved</span></button></nav>
    <div class="bar"><input v-model="name" maxlength="120" aria-label="Forecast name" class="nm"><button class="btn" :disabled="busy" @click="save()">{{ busy ? 'Saving…' : dirty || !sel ? 'Save' : 'Saved' }}</button><button v-if="sel" class="btn secondary" :disabled="busy" @click="save(true)">Save as copy</button><button class="btn secondary" :disabled="!sel" :title="sel ? '' : 'Save the forecast first'" @click="shareOpen = true">Share{{ cur0?.views ? ' · ' + cur0.views + ' views' : '' }}</button><button class="btn secondary" @click="csv">Export CSV</button><span class="sp" /><button v-if="sel" class="lk red" @click="del">Delete</button></div>
    <p v-if="a.fixed && Object.keys(a.fixed).length" class="note">{{ mon(Object.keys(a.fixed).sort()[0]!) }} to {{ mon(Object.keys(a.fixed).sort().pop()!) }} use the figures imported from {{ a.source?.file || 'your accountant' }}; the assumptions below apply after that. <button class="lk" @click="dropFixed">Use assumptions for every month instead</button></p>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok && !dirty" class="ok">{{ ok }}</p>
    <p v-if="!data.has_actuals && !a.fixed" class="note">No monthly figures yet, so the starting point is blank. Add your statements under Financials, or type your current cash, revenue and costs below.</p>
    <div class="seg" role="tablist"><button v-for="s in (['base', 'best', 'worst'] as const)" :key="s" :class="{ on: sc === s }" @click="sc = s">{{ s === 'base' ? 'Base case' : s === 'best' ? 'Best case' : 'Worst case' }}</button></div>
    <div class="fx-stats">
      <StatTile label="Cash at the end" :value="m(res.summary.cash_end)" :note="mon(res.months[res.months.length - 1]?.month ?? null)" :red="res.summary.cash_end < 0" />
      <StatTile :label="res.summary.zero_cash ? 'Cash runs out' : 'Lowest cash'" :value="res.summary.zero_cash ? mon(res.summary.zero_cash) : m(res.summary.min_cash)" :note="res.summary.zero_cash ? 'Raise or cut before then' : mon(res.summary.min_cash_month)" :red="!!res.summary.zero_cash" full />
      <StatTile label="Break-even" :value="res.summary.break_even ? mon(res.summary.break_even) : 'Not in this forecast'" note="First month with a profit" full />
      <StatTile label="ARR at the end" :value="m(res.summary.arr_end)" :note="'Revenue ' + m(res.summary.revenue_total) + ' over ' + a.months + ' months'" />
    </div>
    <div class="card"><ForecastChart :actual="chart.actual" :forecast="chart.forecast" :currency="cur" /></div>
    <div class="grid">
      <aside class="as">
        <div class="sec"><button class="sh" @click="open.start = !open.start"><b>Starting point</b><span>{{ mon(a.start) }} · {{ a.months }} months</span></button>
          <div v-if="open.start" class="sb"><div class="g2"><label>First month<input v-model="a.start" type="month"></label><label>Length<select v-model.number="a.months"><option v-for="n in [12, 18, 24, 36, 48, 60]" :key="n" :value="n">{{ n }} months</option></select></label>
            <label>Cash today<input v-model.number="a.opening.cash" type="number"></label><label>Revenue this month<input v-model.number="a.opening.revenue" type="number" min="0"></label>
            <label>Customers today<input v-model.number="a.opening.customers" type="number" min="0"></label><label>Headcount today<input v-model.number="a.opening.headcount" type="number" min="0"></label></div>
            <button v-if="data.has_actuals" class="lk" @click="reseed">Reset to my latest actuals</button></div></div>
        <div class="sec"><button class="sh" @click="open.revenue = !open.revenue"><b>Revenue</b><span>{{ a.revenue.mode === 'growth' ? a.revenue.growth_pct + '% a month' : 'Customers × price' }}</span></button>
          <div v-if="open.revenue" class="sb"><div class="rad"><label><input v-model="a.revenue.mode" type="radio" value="growth"> Grow by a rate</label><label><input v-model="a.revenue.mode" type="radio" value="customers"> Customers × price</label></div>
            <div v-if="a.revenue.mode === 'growth'" class="g2"><label>Monthly growth %<input v-model.number="a.revenue.growth_pct" type="number" step="0.5"></label></div>
            <div v-else class="g2"><label>New customers a month<input v-model.number="a.revenue.new_customers" type="number" min="0"></label><label>Growth in new customers %<input v-model.number="a.revenue.new_growth_pct" type="number" step="0.5"></label>
              <label>Monthly churn %<input v-model.number="a.revenue.churn_pct" type="number" min="0" step="0.5"></label><label>Revenue per customer / month<input v-model.number="a.revenue.arpu" type="number" min="0"></label><label>Price growth % a month<input v-model.number="a.revenue.arpu_growth_pct" type="number" step="0.5"></label></div>
            <div class="g2"><label>Cost of revenue (% of revenue)<input v-model.number="a.cogs_pct" type="number" min="0" max="100"></label></div></div></div>
        <div class="sec"><button class="sh" @click="open.costs = !open.costs"><b>Operating costs</b><span>{{ m(a.costs.reduce((s, c) => s + c.amount, 0)) }} a month</span></button>
          <div v-if="open.costs" class="sb"><div v-for="c in a.costs" :key="c.key" class="cl"><span>{{ c.label }}</span><input v-model.number="c.amount" type="number" min="0" :aria-label="c.label + ' per month'"><input v-model.number="c.growth_pct" type="number" step="0.5" :aria-label="c.label + ' growth % a month'" class="pc"><em>% / mo</em></div>
            <div class="g2"><label>Tax on profit %<input v-model.number="a.tax_pct" type="number" min="0" max="100"></label></div></div></div>
        <div class="sec"><button class="sh" @click="open.people = !open.people"><b>People</b><span>{{ m(a.opening.payroll) }} payroll · {{ a.hires.length }} hire{{ a.hires.length === 1 ? '' : 's' }}</span></button>
          <div v-if="open.people" class="sb"><div class="g2"><label>Payroll today (a month)<input v-model.number="a.opening.payroll" type="number" min="0"></label><label>Yearly raise % (each January)<input v-model.number="a.payroll_raise_pct" type="number" step="0.5"></label></div>
            <p class="kl">Planned hires</p><div v-for="(h, i) in a.hires" :key="i" class="row3"><input v-model="h.role" placeholder="Role" maxlength="80"><input v-model="h.start" type="month"><input v-model.number="h.monthly_cost" type="number" min="0" placeholder="Cost / month"><button class="x" :aria-label="'Remove ' + h.role" @click="a.hires.splice(i, 1)">×</button></div>
            <button class="lk" @click="addHire">+ Add a hire</button></div></div>
        <div class="sec"><button class="sh" @click="open.money = !open.money"><b>Funding and one-offs</b><span>{{ m(a.funding.reduce((s, f) => s + f.amount, 0)) }} raised</span></button>
          <div v-if="open.money" class="sb"><p class="kl">Funding (money in)</p><div v-for="(f, i) in a.funding" :key="'f' + i" class="row3"><input v-model="f.label" placeholder="e.g. Seed round" maxlength="80"><input v-model="f.month" type="month"><input v-model.number="f.amount" type="number" placeholder="Amount"><button class="x" aria-label="Remove" @click="a.funding.splice(i, 1)">×</button></div><button class="lk" @click="addFund">+ Add funding</button>
            <p class="kl">One-off items (+ in, − out)</p><div v-for="(f, i) in a.items" :key="'i' + i" class="row3"><input v-model="f.label" placeholder="e.g. Laptops" maxlength="80"><input v-model="f.month" type="month"><input v-model.number="f.amount" type="number" placeholder="Amount"><button class="x" aria-label="Remove" @click="a.items.splice(i, 1)">×</button></div><button class="lk" @click="addItem">+ Add an item</button></div></div>
        <div class="sec"><button class="sh" @click="open.scen = !open.scen"><b>Scenarios</b><span>Best and worst case</span></button>
          <div v-if="open.scen" class="sb"><p class="hint">Added to the monthly growth rate, and to all costs, in each case.</p><div class="g2"><label>Best: growth ± points<input v-model.number="a.scenarios.best.growth" type="number" step="0.5"></label><label>Best: costs ± %<input v-model.number="a.scenarios.best.costs" type="number" step="1"></label>
            <label>Worst: growth ± points<input v-model.number="a.scenarios.worst.growth" type="number" step="0.5"></label><label>Worst: costs ± %<input v-model.number="a.scenarios.worst.costs" type="number" step="1"></label></div></div></div>
      </aside>
      <div class="rs">
        <div class="card pad0"><div class="tw"><table class="t" data-nosearch><thead><tr><th class="st">{{ cur }}</th><th v-for="x in res.months" :key="x.month">{{ mon(x.month) }}</th></tr></thead>
          <tbody><tr v-for="[l, f, k] in ROWS" :key="l" :class="k"><td class="st">{{ l }}</td><td v-for="x in res.months" :key="x.month" :class="{ neg: (f(x) ?? 0) < 0 }">{{ k === 'p' ? (f(x) === null ? '—' : f(x) + '%') : k === 'n' ? (f(x) ?? '—') : full(f(x)) }}</td></tr></tbody></table></div></div>
        <div v-if="vs.length" class="card"><h3>Actual against this forecast</h3><table class="t sm" data-nosearch><thead><tr><th>Month</th><th>Revenue (actual)</th><th>Revenue (forecast)</th><th>Difference</th><th>Cash (actual)</th><th>Cash (forecast)</th></tr></thead>
          <tbody><tr v-for="p in vs" :key="p.x.month"><td>{{ mon(p.x.month) }}</td><td>{{ full(p.x.revenue) }}</td><td>{{ full(p.f!.revenue) }}</td><td :class="{ neg: (p.x.revenue ?? 0) < p.f!.revenue }">{{ p.f!.revenue ? Math.round(((p.x.revenue ?? 0) / p.f!.revenue - 1) * 1000) / 10 + '%' : '—' }}</td><td>{{ full(p.x.cash) }}</td><td>{{ full(p.f!.cash) }}</td></tr></tbody></table></div>
        <p class="fine">A forecast is an estimate from the assumptions you enter, not a promise of results. Figures in {{ cur }}.</p>
      </div>
    </div>
    <ForecastImport :open="imp" :seed="data.seed" @close="imp = false" @done="imported" />
    <ShareLinks :open="shareOpen" kind="forecast" :object-id="sel" :title="name" @close="shareOpen = false" @changed="refresh()" />
  </section>
</template>
<style scoped>
.fc { display: flex; flex-direction: column; gap: 16px; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 620px; }
.ft { display: flex; gap: 2px; border-bottom: 1px solid var(--c-rule); overflow-x: auto; margin-top: 4px; } .ft button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 14px; font: inherit; font-size: 14px; color: var(--c-muted); cursor: pointer; white-space: nowrap; margin-bottom: -1px; } .ft button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); font-weight: 500; } .ft .vw { font-size: 11.5px; color: var(--c-muted); margin-left: 6px; font-weight: 400; }
.bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .bar .nm { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); width: 240px; } .bar .sp { flex: 1; }
.tb { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .tb select, .tb input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .tb .nm { width: 180px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); }
.note { margin: 0; padding: 10px 14px; background: #fff; border: 1px solid var(--c-rule); color: var(--c-ink-soft); font-size: 13.5px; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); width: fit-content; } .seg button { font: inherit; font-size: 13px; padding: 7px 14px; background: #fff; border: 0; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 1px solid var(--c-rule-strong); } .seg button.on { background: var(--c-navy); color: #fff; }
.grid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 16px; align-items: start; }
.as { display: flex; flex-direction: column; border: 1px solid var(--c-rule); background: #fff; position: sticky; top: 70px; max-height: calc(var(--vh100) - 90px); overflow-y: auto; }
.sec + .sec { border-top: 1px solid var(--c-rule); } .sh { width: 100%; display: flex; justify-content: space-between; gap: 8px; align-items: baseline; padding: 12px 14px; background: none; border: 0; font: inherit; cursor: pointer; text-align: left; } .sh b { font-size: 14px; color: var(--c-ink); font-weight: 600; } .sh span { font-size: 12px; color: var(--c-muted); }
.sb { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 10px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .g2 label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--c-ink-soft); }
.sb input:not([type="radio"]), .sb select { font: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; width: 100%; }
.rad { display: flex; gap: 14px; font-size: 13px; } .rad label { display: flex; gap: 6px; align-items: center; }
.cl { display: grid; grid-template-columns: minmax(0, 1fr) 96px 54px auto; gap: 6px; align-items: center; font-size: 12.5px; color: var(--c-ink-soft); } .cl em { font-style: normal; font-size: 11px; color: var(--c-muted); }
.row3 { display: grid; grid-template-columns: minmax(0, 1fr) 112px 92px 20px; gap: 6px; align-items: center; } .x { background: none; border: 0; color: var(--c-muted); font-size: 16px; cursor: pointer; } .kl { margin: 4px 0 0; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); } .hint { margin: 0; font-size: 12px; color: var(--c-muted); }
.rs { display: flex; flex-direction: column; gap: 16px; min-width: 0; } .pad0 { padding: 0; } .tw { overflow-x: auto; }
.t { border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; width: max-content; min-width: 100%; } .t th { font-weight: 500; color: var(--c-muted); text-align: right; padding: 9px 10px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; background: #fbfaf7; }
.t td { text-align: right; padding: 6px 10px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; color: var(--c-ink-soft); } .t .st { position: sticky; left: 0; background: #fff; text-align: left; min-width: 190px; color: var(--c-ink); z-index: 1; } .t th.st { background: #fbfaf7; }
.t tr.b td { font-weight: 600; color: var(--c-ink); } .t tr.h td { font-weight: 600; color: var(--c-navy); background: #f4f6f9; } .t tr.h td.st { background: #f4f6f9; } .t td.neg { color: var(--c-danger); }
.t.sm { width: 100%; } .t.sm th, .t.sm td { text-align: left; } h3 { margin: 0 0 10px; font-size: 15px; } .fine { margin: 0; font-size: 12px; color: var(--c-muted); }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } .as { position: static; max-height: none; } }
</style>
