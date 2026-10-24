<script setup lang="ts">
// Finvry forecast: revenue, costs, profit, cash and runway by month, from your actuals and a few assumptions.
import { run, defaults, addMonths, COST_LINES, forecastRows, partParents, partKey, type Part, type Assumptions, type Scenario, type FinSource, type BankSource, type GroupCo } from '~/shared/forecast'
useHead({ title: 'Forecast' })
interface Act { month: string; revenue: number | null; cogs: number | null; opex: number | null; net_income: number | null; cash: number | null }
// On Finvry the forecast sits under Financials and follows the company (or the group) chosen at the top: each company
// keeps its own forecasts in its own currency; the group adds each company's forecast together (ForecastGroup).
const fs = await useFinScope()
const scoped = computed(() => !!fs.co.value)
const fq = computed<Record<string, string>>(() => (scoped.value ? { cust: fs.isGroup.value ? 'group' : fs.entityId.value ?? '' } : {} as Record<string, string>))
interface One { ng_bank?: boolean; group?: false; company?: { id: string | null; name: string; currency: string; main: boolean; companies: number }; fin: FinSource | null; bank: BankSource | null; live: boolean; currency: string; actuals: Act[]; seed: Assumptions; forecasts: { id: string; name: string; updated_at: string; start: string; months: number; views: number; links: number; is_main?: boolean }[]; has_actuals: boolean }
interface Grp { group: true; currency: string; name: string; companies: GroupCo[] }
const { data, refresh } = await useFetch<One | Grp>('/api/forecast', { query: fq })
const one = computed(() => (data.value && !data.value.group ? data.value as One : null))
const grp = computed(() => (data.value?.group ? data.value as Grp : null))
const rfetch = useRequestFetch() // forwards the sign-in cookie when the page renders on the server
const sel = ref(''), name = ref('Base plan'), a = ref<Assumptions>(structuredClone(toRaw(one.value?.seed ?? defaults(new Date().toISOString().slice(0, 7)))))
const sc = ref<Scenario>('base'), msg = ref(''), ok = ref(''), busy = ref(false), dirty = ref(false)
watch(a, () => { dirty.value = true }, { deep: true })
async function pick(id: string) {
  sel.value = id; msg.value = ''; ok.value = ''
  if (!id) { a.value = structuredClone(toRaw(one.value!.seed)); name.value = 'New forecast'; await nextTick(); dirty.value = false; return }
  const f = await rfetch<{ name: string; assumptions: Assumptions }>('/api/forecast/' + id); name.value = f.name; a.value = { ...defaults(f.assumptions.start), ...f.assumptions }; await nextTick(); dirty.value = false
}
const route = useRoute()
const want = String(route.query.f ?? '')
if (one.value?.forecasts.length) await pick(one.value!.forecasts.find((f) => f.id === want)?.id ?? one.value!.forecasts[0]!.id)
// Another company chosen at the top: open its forecast (or a new one from its numbers).
watch(() => (one.value ? one.value.company?.id ?? '-' : 'group'), async (k, was) => { if (k === was || !one.value) return; const l = one.value.forecasts; await pick(l.find((f) => f.is_main)?.id ?? l[0]?.id ?? '') })
const { canPath } = useModuleAccess(), hasRoom = computed(() => canPath('/fundraising'))
const build = ref(false)
// Built from the numbers: saved straight away, like an upload, so there is no separate save step.
async function built(v: { name: string; assumptions: Assumptions }) { build.value = false; await imported(v); if (!msg.value) ok.value = 'Built and saved as "' + v.name + '". Change any assumption below and save.' }
// The bank against this forecast: what actually left the bank each month lately, and what the forecast spends.
const bankCheck = computed(() => { const b = one.value?.bank; if (!b?.connected || !b.full_months) return null; const f = res.value.months.slice(0, 3); if (!f.length) return null; const fOut = f.reduce((s, x) => s + x.cogs + x.opex + Math.max(0, -x.items), 0) / f.length; const diff = fOut - b.avg_out; return { bankOut: b.avg_out, fOut, diff, off: Math.abs(diff) > Math.max(1000, b.avg_out * 0.15) } })
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
// The forecast this company's figures in the group forecast come from (only when it is part of a group).
const inGroup = computed(() => (one.value?.company?.companies ?? 0) > 1)
const isMain = computed(() => { const l = one.value?.forecasts ?? []; return !!sel.value && (l.find((f) => f.is_main)?.id ?? l[0]?.id) === sel.value })
async function useForGroup() { msg.value = ''; ok.value = ''; try { await $fetch('/api/forecast', { method: 'POST', query: fq.value, body: { id: sel.value, main: true } }); await refresh(); ok.value = 'The group forecast now uses "' + name.value + '" for ' + (one.value?.company?.name ?? 'this company') + '.' } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
const tplHref = computed(() => '/api/forecast/template' + (fq.value.cust ? '?cust=' + encodeURIComponent(fq.value.cust) : ''))
const canLink = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
// A linked sheet updated a forecast: reload it unless there are unsaved changes.
async function linked(fid?: string) { await refresh(); if (fid) { await pick(fid); ok.value = 'Linked and saved as "' + name.value + '". It stays in step with the sheet.' } else if (sel.value && !dirty.value) await pick(sel.value) }
// A company with no forecast yet sees three ways to add one (like Customers), not an empty editor to save.
const scratch = ref(false), slRef = ref<{ start: () => void } | null>(null)
const empty = computed(() => !!one.value && !one.value.forecasts.length && !scratch.value && !sel.value && !dirty.value)
watch(() => one.value?.company?.id, () => { scratch.value = false })
const imp = ref(false), shareOpen = ref(route.query.share === '1' && !!sel.value)
const cur0 = computed(() => one.value?.forecasts.find((f) => f.id === sel.value))
watch(sel, (id) => { if (grp.value) return; useRouter().replace({ query: { ...route.query, f: id || undefined } }) })
async function imported(v: { name: string; assumptions: Assumptions }) {
  imp.value = false; msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/forecast', { method: 'POST', query: fq.value, body: { name: v.name, assumptions: v.assumptions } }); await refresh(); await pick(r.id); ok.value = 'Imported and saved as "' + v.name + '".' }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save the imported forecast.' }
}
async function dropFixed() { if (!await askConfirm('Stop using the imported figures? Save to keep this change.')) return; const x = { ...a.value }; delete x.fixed; delete x.source; a.value = x }
const res = computed(() => run(a.value, sc.value))
const cur = computed(() => a.value.currency)
const m = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, cur.value))
const full = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (v < 0 ? '(' : '') + Math.abs(Math.round(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''))
const mon = (ym: string | null) => (ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
async function save(asNew = false) {
  busy.value = true; msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ id: string }>('/api/forecast', { method: 'POST', query: fq.value, body: { id: asNew ? undefined : sel.value || undefined, name: name.value, assumptions: a.value } }); sel.value = r.id; dirty.value = false; ok.value = 'Saved.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
async function del() { if (!sel.value || !await askConfirm('Delete "' + name.value + '"?')) return; await $fetch('/api/forecast', { method: 'POST', query: fq.value, body: { id: sel.value, delete: true } }); await refresh(); await pick(one.value?.forecasts[0]?.id ?? '') }
async function reseed() { if (!await askConfirm('Reset the starting point to your latest actuals?')) return; const s = one.value!.seed; a.value.opening = { ...s.opening }; a.value.start = s.start; a.value.cogs_pct = s.cogs_pct; a.value.costs = structuredClone(toRaw(s.costs)) }
const addHire = () => a.value.hires.push({ role: '', start: addMonths(a.value.start, 1), monthly_cost: 0 })
const addFund = () => a.value.funding.push({ label: 'Seed round', month: addMonths(a.value.start, 3), amount: 0 })
const addItem = () => a.value.items.push({ label: '', month: addMonths(a.value.start, 1), amount: 0 })
// The company's own cost lines (beyond the four standard ones), up to 12 lines in all.
const newCost = ref('')
function addCost() { const label = newCost.value.trim().slice(0, 80); if (!label) return; let k = 'x_' + (label.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'cost'); while (a.value.costs.some((c) => c.key === k)) k = k.slice(0, 27) + '_a'; a.value.costs.push({ key: k, label, amount: 0, growth_pct: 1 }); newCost.value = '' }
const open = reactive<Record<string, boolean>>({ parts: false, start: true, revenue: true, costs: true, people: false, money: false, scen: false })
// Chart: last 12 actual months then the forecast.
const chart = computed(() => ({ actual: (one.value?.actuals ?? []).filter((x) => x.month < a.value.start).map((x) => ({ month: x.month, revenue: x.revenue ?? 0, costs: (x.cogs ?? 0) + (x.opex ?? 0), cash: x.cash })), forecast: res.value.months.map((x) => ({ month: x.month, revenue: x.revenue, costs: x.cogs + x.opex, cash: x.cash })) }))
// Actuals against this forecast, for months that have both.
const vs = computed(() => (one.value?.actuals ?? []).map((x) => ({ x, f: res.value.months.find((y) => y.month === x.month) })).filter((p) => p.f && p.x.revenue !== null))
const ROWS = computed(() => forecastRows(a.value, res.value.months))
// The company's own lines (products, carriers, cost items) under a forecast line: in given months the figures given,
// after that their share of the line.
const PARENTS = computed(() => partParents(a.value))
const partGroups = computed(() => PARENTS.value.map((p) => ({ ...p, parts: (a.value.parts ?? []).filter((x) => x.parent === p.key), sum: (a.value.parts ?? []).filter((x) => x.parent === p.key).reduce((t, x) => t + (Number(x.share_pct) || 0), 0) })).filter((g) => g.parts.length))
const np = reactive({ label: '', parent: 'revenue', share: 0 as number | '' })
const noShare = (k: string) => k === 'items' || k === 'funding'
function addPart() {
  const label = np.label.trim().slice(0, 80); if (!label || (a.value.parts?.length ?? 0) >= 60) return
  const list = a.value.parts ?? []; list.push({ key: partKey(label, list.map((x) => x.key)), label, parent: np.parent, share_pct: Number(np.share) || 0 }); a.value.parts = list
  np.label = ''; np.share = 0
}
function removePart(p: Part) {
  a.value.parts = (a.value.parts ?? []).filter((x) => x !== p)
  for (const f of Object.values(a.value.fixed ?? {})) if (f.parts) delete f.parts[p.key]
}
function csv() {
  const head = ['Line', ...res.value.months.map((x) => x.month)]
  const lines = [head, ...ROWS.value.map((r) => [(r.kind === 's' ? '  ' : '') + r.label, ...res.value.months.map((x) => { const v = r.get(x); return v === null ? '' : String(Math.round(v * 100) / 100) })])]
  const blob = new Blob([lines.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')], { type: 'text/csv' })
  const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = (name.value || 'forecast') + ' (' + sc.value + ').csv'; l.click(); URL.revokeObjectURL(u)
}
</script>
<template>
  <section v-if="data" class="fc">
    <FinHeader v-if="scoped" />
    <template v-else><p class="label">Investor relations</p><InvestorTabs /></template>
    <ForecastGroup v-if="grp" :data="grp" :can-edit="canEdit" @open="(id: string) => { fs.s.value = 'entity:' + id }" @refresh="refresh()" />
    <template v-if="one">
    <div v-if="empty" class="start">
      <h2>Add {{ one.company?.name ? one.company.name + '\'s' : 'your' }} forecast</h2><p class="lead">Revenue, costs, profit and cash by month{{ scoped ? ', in ' + one.currency : '' }}. Pick a way to start; you can change anything later.</p>
      <div class="opts">
        <div class="opt"><b>Upload a forecast</b><p>The Finvry template (Excel or CSV) or your accountant's PDF.</p><div class="oa"><button class="btn" @click="imp = true">Upload a file</button><a class="lk" :href="tplHref">Download the template</a></div></div>
        <div class="opt"><b>Link a Google Sheet</b><p>A sheet in the template layout, kept in sync.</p><div class="oa"><button class="btn" :disabled="!canLink" @click="slRef?.start()">Link a sheet</button></div></div>
        <div class="opt"><b>Build from my numbers</b><p>From {{ one.has_actuals ? 'your statements' : 'your cash, revenue and costs' }}{{ one.bank?.connected ? ' and your bank' : '' }}, ready to adjust.</p><div class="oa"><button class="btn" @click="build = true">Build it</button></div></div>
      </div>
      <button class="lk" @click="scratch = true; pick('')">Or start from a blank forecast</button>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <template v-else>
    <div class="hd"><div><h1 v-if="!scoped">Forecast</h1><p class="lead">Revenue, costs, profit and cash by month{{ scoped && one.company?.name ? ' for ' + one.company.name + ', in ' + one.currency : '' }}.</p></div>
      <div class="tb"><button class="btn" @click="build = true">Build from my numbers</button><button class="btn secondary" @click="imp = true">Import from a file</button><a class="btn secondary" :href="tplHref">Forecast template</a><button class="btn secondary" @click="pick('')">New forecast</button></div></div>
    <nav class="ft"><button v-for="f in one.forecasts" :key="f.id" :class="{ on: sel === f.id }" @click="pick(f.id)">{{ f.name }}<span v-if="f.views" class="vw">{{ f.views }} view{{ f.views === 1 ? '' : 's' }}</span></button><button v-if="!sel" class="on">{{ name || 'New forecast' }} <span class="vw">not saved</span></button></nav>
    <div class="bar"><input v-model="name" maxlength="120" aria-label="Forecast name" class="nm"><button class="btn" :disabled="busy" @click="save()">{{ busy ? 'Saving…' : dirty || !sel ? 'Save' : 'Saved' }}</button><button v-if="sel" class="btn secondary" :disabled="busy" @click="save(true)">Save as copy</button><button class="btn secondary" :disabled="!sel" :title="sel ? '' : 'Save the forecast first'" @click="shareOpen = true">Share{{ cur0?.views ? ' · ' + cur0.views + ' views' : '' }}</button><button class="btn secondary" @click="csv">Export CSV</button><AddToRoom v-if="sel && hasRoom" kind="forecast" :id="sel" format="xlsx" label="Add to data room" /><span class="sp" /><span v-if="inGroup && sel && isMain" class="gm">Used for the group</span><button v-else-if="inGroup && sel && canEdit" class="lk" @click="useForGroup">Use for the group forecast</button><button v-if="sel" class="lk red" @click="del">Delete</button></div>
    <p v-if="a.fixed && Object.keys(a.fixed).length" class="note">{{ mon(Object.keys(a.fixed).sort()[0]!) }} to {{ mon(Object.keys(a.fixed).sort().pop()!) }} use figures from {{ a.source?.file || 'your accountant' }}; assumptions apply after. <button class="lk" @click="dropFixed">Use assumptions for every month instead</button></p>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok && !dirty" class="ok">{{ ok }}</p>
    </template>
    <ClientOnly><SheetLinks ref="slRef" :class="{ hid: empty }" target="forecast" :forecasts="one.forecasts" :forecast-id="sel" :currency="one.currency" :can-edit="canLink" :scope-query="fq" @synced="linked" /></ClientOnly>
    <template v-if="!empty">
    <p v-if="!one.has_actuals && !a.fixed && !one.bank?.connected" class="note">No monthly figures yet. Add statements in Financials{{ one.ng_bank ? '' : ' or connect your bank' }}, then use <button class="lk" @click="build = true">Build from my numbers</button>, or type them below.</p>
    <p v-if="bankCheck" class="note">Bank check: over the last {{ one.bank!.full_months }} months <b>{{ m(bankCheck.bankOut) }}</b> a month left your bank; this forecast spends <b>{{ m(bankCheck.fOut) }}</b> a month at the start{{ bankCheck.off ? (bankCheck.diff < 0 ? ', which looks low.' : ', which looks high.') : ', in line.' }} <button v-if="bankCheck.off" class="lk" @click="build = true">Rebuild matched to the bank</button> · Cash in the bank now <b>{{ m(one.bank!.cash) }}</b> <button v-if="Math.abs(a.opening.cash - one.bank!.cash) > 1" class="lk" @click="a.opening.cash = one.bank!.cash">Use as opening cash</button></p>
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
            <label>Cash today{{ one.bank?.connected ? ' (bank: ' + m(one.bank.cash) + ')' : '' }}<input v-model.number="a.opening.cash" type="number"></label><label>Revenue this month<input v-model.number="a.opening.revenue" type="number" min="0"></label>
            <label>Customers today<input v-model.number="a.opening.customers" type="number" min="0"></label><label>Headcount today<input v-model.number="a.opening.headcount" type="number" min="0"></label></div>
            <button v-if="one.has_actuals" class="lk" @click="reseed">Reset to my latest actuals</button></div></div>
        <div class="sec"><button class="sh" @click="open.revenue = !open.revenue"><b>Revenue</b><span>{{ a.revenue.mode === 'growth' ? a.revenue.growth_pct + '% a month' : 'Customers × price' }}</span></button>
          <div v-if="open.revenue" class="sb"><div class="rad"><label><input v-model="a.revenue.mode" type="radio" value="growth"> Grow by a rate</label><label><input v-model="a.revenue.mode" type="radio" value="customers"> Customers × price</label></div>
            <div v-if="a.revenue.mode === 'growth'" class="g2"><label>Monthly growth %<input v-model.number="a.revenue.growth_pct" type="number" step="0.5"></label></div>
            <div v-else class="g2"><label>New customers a month<input v-model.number="a.revenue.new_customers" type="number" min="0"></label><label>Growth in new customers %<input v-model.number="a.revenue.new_growth_pct" type="number" step="0.5"></label>
              <label>Monthly churn %<input v-model.number="a.revenue.churn_pct" type="number" min="0" step="0.5"></label><label>Revenue per customer / month<input v-model.number="a.revenue.arpu" type="number" min="0"></label><label>Price growth % a month<input v-model.number="a.revenue.arpu_growth_pct" type="number" step="0.5"></label></div>
            <div class="g2"><label>Cost of revenue (% of revenue)<input v-model.number="a.cogs_pct" type="number" min="0" max="100"></label></div></div></div>
        <div class="sec"><button class="sh" @click="open.parts = !open.parts"><b>Products and your own lines</b><span>{{ a.parts?.length ? a.parts.length + ' line' + (a.parts.length === 1 ? '' : 's') : 'Break lines down' }}</span></button>
          <div v-if="open.parts" class="sb"><p class="hint">Split lines the way you report them, e.g. products under Revenue.</p>
            <div v-for="g in partGroups" :key="g.key" class="pg"><p class="kl">{{ g.label }}<em v-if="!noShare(g.key) && Math.abs(g.sum - 100) > 0.05" :class="{ over: g.sum > 100.05 }"> · shares add to {{ Math.round(g.sum * 10) / 10 }}%{{ g.sum < 100 ? ', the rest shows as Other' : '' }}</em></p>
              <div v-for="p in g.parts" :key="p.key" class="pl"><input v-model="p.label" maxlength="80" :aria-label="'Name of ' + p.label"><template v-if="!noShare(g.key)"><input v-model.number="p.share_pct" type="number" step="0.5" class="pc" :aria-label="p.label + ' share %'"><em>%</em></template><span v-else /><button class="x" :aria-label="'Remove ' + p.label" @click="removePart(p)">×</button></div></div>
            <form class="addp" @submit.prevent="addPart"><input v-model="np.label" maxlength="80" placeholder="Add a line, e.g. Subscriptions or Rent"><select v-model="np.parent" aria-label="Under"><option v-for="x in PARENTS" :key="x.key" :value="x.key">Under {{ x.label }}</option></select><input v-if="!noShare(np.parent)" v-model.number="np.share" type="number" step="0.5" placeholder="%" aria-label="Share %" class="pc"><button class="btn secondary sm" type="submit" :disabled="!np.label.trim()">Add</button></form></div></div>
        <div class="sec"><button class="sh" @click="open.costs = !open.costs"><b>Operating costs</b><span>{{ m(a.costs.reduce((s, c) => s + c.amount, 0)) }} a month</span></button>
          <div v-if="open.costs" class="sb"><div v-for="c in a.costs" :key="c.key" class="cl"><span>{{ c.label }}</span><input v-model.number="c.amount" type="number" min="0" :aria-label="c.label + ' per month'"><input v-model.number="c.growth_pct" type="number" step="0.5" :aria-label="c.label + ' growth % a month'" class="pc"><em>% / mo</em><button v-if="!COST_LINES.some((b) => b.key === c.key)" type="button" class="rmc" :aria-label="'Remove ' + c.label" @click="a.costs = a.costs.filter((x) => x !== c)">×</button></div>
            <form v-if="a.costs.length < 12" class="addc" @submit.prevent="addCost"><input v-model="newCost" maxlength="60" placeholder="Add a cost line, e.g. Rent"><button class="btn secondary sm" type="submit" :disabled="!newCost.trim()">Add</button></form>
            <div class="g2"><label>Tax on profit %<input v-model.number="a.tax_pct" type="number" min="0" max="100"></label></div></div></div>
        <div class="sec"><button class="sh" @click="open.people = !open.people"><b>People</b><span>{{ m(a.opening.payroll) }} payroll · {{ a.hires.length }} hire{{ a.hires.length === 1 ? '' : 's' }}</span></button>
          <div v-if="open.people" class="sb"><div class="g2"><label>Payroll today (a month)<input v-model.number="a.opening.payroll" type="number" min="0"></label><label>Yearly raise % (each January)<input v-model.number="a.payroll_raise_pct" type="number" step="0.5"></label></div>
            <p class="kl">Planned hires</p><div v-for="(h, i) in a.hires" :key="i" class="row3"><input v-model="h.role" placeholder="Role" maxlength="80"><input v-model="h.start" type="month"><input v-model.number="h.monthly_cost" type="number" min="0" placeholder="Cost / month"><button class="x" :aria-label="'Remove ' + h.role" @click="a.hires.splice(i, 1)">×</button></div>
            <button class="lk" @click="addHire">+ Add a hire</button></div></div>
        <div class="sec"><button class="sh" @click="open.money = !open.money"><b>Funding and one-offs</b><span>{{ m(a.funding.reduce((s, f) => s + f.amount, 0)) }} raised</span></button>
          <div v-if="open.money" class="sb"><p class="kl">Funding (money in)</p><div v-for="(f, i) in a.funding" :key="'f' + i" class="row3"><input v-model="f.label" placeholder="e.g. Seed round" maxlength="80"><input v-model="f.month" type="month"><input v-model.number="f.amount" type="number" placeholder="Amount"><button class="x" aria-label="Remove" @click="a.funding.splice(i, 1)">×</button></div><button class="lk" @click="addFund">+ Add funding</button>
            <p class="kl">One-off items (+ in, − out)</p><div v-for="(f, i) in a.items" :key="'i' + i" class="row3"><input v-model="f.label" placeholder="e.g. Laptops" maxlength="80"><input v-model="f.month" type="month"><input v-model.number="f.amount" type="number" placeholder="Amount"><button class="x" aria-label="Remove" @click="a.items.splice(i, 1)">×</button></div><button class="lk" @click="addItem">+ Add an item</button></div></div>
        <div class="sec"><button class="sh" @click="open.scen = !open.scen"><b>Scenarios</b><span>Best and worst case</span></button>
          <div v-if="open.scen" class="sb"><p class="hint">Applied to monthly growth and all costs.</p><div class="g2"><label>Best: growth ± points<input v-model.number="a.scenarios.best.growth" type="number" step="0.5"></label><label>Best: costs ± %<input v-model.number="a.scenarios.best.costs" type="number" step="1"></label>
            <label>Worst: growth ± points<input v-model.number="a.scenarios.worst.growth" type="number" step="0.5"></label><label>Worst: costs ± %<input v-model.number="a.scenarios.worst.costs" type="number" step="1"></label></div></div></div>
      </aside>
      <div class="rs">
        <div class="card pad0"><div class="tw"><table class="t" data-nosearch><thead><tr><th class="st">{{ cur }}</th><th v-for="x in res.months" :key="x.month">{{ mon(x.month) }}</th></tr></thead>
          <tbody><tr v-for="(r, i) in ROWS" :key="i" :class="r.kind"><td class="st">{{ r.label }}</td><td v-for="x in res.months" :key="x.month" :class="{ neg: (r.get(x) ?? 0) < 0 }">{{ r.kind === 'p' ? (r.get(x) === null ? '—' : r.get(x) + '%') : r.kind === 'n' ? (r.get(x) ?? '—') : full(r.get(x)) }}</td></tr></tbody></table></div></div>
        <div v-if="vs.length" class="card"><h3>Actual against this forecast</h3><table class="t sm" data-nosearch><thead><tr><th>Month</th><th>Revenue (actual)</th><th>Revenue (forecast)</th><th>Difference</th><th>Cash (actual)</th><th>Cash (forecast)</th></tr></thead>
          <tbody><tr v-for="p in vs" :key="p.x.month"><td>{{ mon(p.x.month) }}</td><td>{{ full(p.x.revenue) }}</td><td>{{ full(p.f!.revenue) }}</td><td :class="{ neg: (p.x.revenue ?? 0) < p.f!.revenue }">{{ p.f!.revenue ? Math.round(((p.x.revenue ?? 0) / p.f!.revenue - 1) * 1000) / 10 + '%' : '—' }}</td><td>{{ full(p.x.cash) }}</td><td>{{ full(p.f!.cash) }}</td></tr></tbody></table></div>
        <p class="fine">A forecast is an estimate from the assumptions you enter, not a promise of results. Figures in {{ cur }}.</p>
      </div>
    </div>
    </template>
    <ForecastBuild :open="build" :seed="one.seed" :fin="one.fin" :bank="one.bank" :currency="one.currency" :ng-bank="one.ng_bank" @close="build = false" @done="built" @refresh="refresh()" />
    <ForecastImport :open="imp" :seed="one.seed" :q="fq" @close="imp = false" @done="imported" />
    <ShareLinks :open="shareOpen" kind="forecast" :object-id="sel" :title="name" @close="shareOpen = false" @changed="refresh()" />
    </template>
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
.cl { display: grid; grid-template-columns: minmax(0, 1fr) 96px 54px auto 18px; gap: 6px; align-items: center; font-size: 12.5px; color: var(--c-ink-soft); } .cl em { font-style: normal; font-size: 11px; color: var(--c-muted); }
.row3 { display: grid; grid-template-columns: minmax(0, 1fr) 112px 92px 20px; gap: 6px; align-items: center; } .x { background: none; border: 0; color: var(--c-muted); font-size: 16px; cursor: pointer; } .kl { margin: 4px 0 0; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); } .hint { margin: 0; font-size: 12px; color: var(--c-muted); }
.rs { display: flex; flex-direction: column; gap: 16px; min-width: 0; } .pad0 { padding: 0; } .tw { overflow-x: auto; }
.t { border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; width: max-content; min-width: 100%; } .t th { font-weight: 500; color: var(--c-muted); text-align: right; padding: 9px 10px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; background: #fbfaf7; }
.t td { text-align: right; padding: 6px 10px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; color: var(--c-ink-soft); } .t .st { position: sticky; left: 0; background: #fff; text-align: left; min-width: 190px; color: var(--c-ink); z-index: 1; } .t th.st { background: #fbfaf7; }
.t tr.b td { font-weight: 600; color: var(--c-ink); } .t tr.h td { font-weight: 600; color: var(--c-navy); background: #f4f6f9; } .t tr.h td.st { background: #f4f6f9; } .t td.neg { color: var(--c-danger); }
.t.sm { width: 100%; } .t.sm th, .t.sm td { text-align: left; } h3 { margin: 0 0 10px; font-size: 15px; } .fine { margin: 0; font-size: 12px; color: var(--c-muted); }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } .as { position: static; max-height: none; } }
.gm { font-size: 12.5px; color: var(--c-muted); margin-right: 12px; } .rmc { background: none; border: 0; color: var(--c-muted); font-size: 16px; cursor: pointer; padding: 0 4px; } .addc { display: flex; gap: 8px; margin: 6px 0 10px; } .addc input { flex: 1; font: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); }
.start { display: flex; flex-direction: column; gap: 14px; padding: 4px 0 8px; } .start h2 { margin: 0; font-size: 22px; } .start .lead { margin: 0; }
.opts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .opt { background: #fff; border: 1px solid var(--c-rule); padding: 18px; display: flex; flex-direction: column; gap: 8px; } .opt b { font-size: 15px; color: var(--c-ink); } .opt p { margin: 0; font-size: 13.5px; color: var(--c-ink-soft); flex: 1; }
.oa { display: flex; gap: 14px; align-items: center; margin-top: 6px; } .start > .lk { align-self: flex-start; } .hid :deep(.sl), .hid { display: none; }
@media (max-width: 900px) { .opts { grid-template-columns: 1fr; } }
.t tr.s td { color: var(--c-muted); font-size: 12px; } .t tr.s td.st { padding-left: 24px; color: var(--c-ink-soft); }
.pl { display: grid; grid-template-columns: minmax(0, 1fr) 76px 14px 18px; gap: 6px; align-items: center; margin-top: 6px; } .pl em { font-style: normal; font-size: 11px; color: var(--c-muted); } .pg + .pg { margin-top: 6px; } .kl em { font-style: normal; text-transform: none; letter-spacing: 0; font-weight: 400; } .kl em.over { color: var(--c-danger); }
.addp { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px; } .addp input:first-child { grid-column: 1 / -1; } .addp .btn { justify-self: start; }
</style>
