<script setup lang="ts">
// Marketing: design the funnel and channels, record each channel's month (spend comes in from Banking and
// customers from won deals where you have them), run campaigns with checklists, and plan: what next month's budget per
// channel should bring in at each channel's own cost per lead and conversion.
import { predictBudget, type Process, type ChannelMonth, type ChannelStat } from '~/shared/growth'
useHead({ title: 'Marketing' })
type Row = ChannelMonth & { auto: string[] }
interface Stats { channels: ChannelStat[]; totals: { spend: number; visitors: number; leads: number; mqls: number; sqls: number; customers: number; revenue: number; cpl: number | null; cac: number | null }; funnel: { name: string; value: number; conv: number | null }[]; months: number }
interface Camp { id: string; name: string; channel_key: string | null; status: 'planned' | 'live' | 'done'; starts_on: string | null; ends_on: string | null; budget: number | null; spend: number | null; leads: number | null; customers: number | null; goal: string | null; steps: { text: string; done: boolean }[]; notes: string | null }
interface D { processes: { id: string; name: string; company: string }[]; rollup: { currency: string; rows: { id: string; name: string; company: string; currency: string; spend: number; leads: number; customers: number; revenue: number }[]; total: { spend: number; leads: number; customers: number; revenue: number } } | null; process: (Process & { company?: string }) | null; campaigns: Camp[]; rows: Row[]; months: string[]; stats: Stats | null; stats6: Stats | null; avg_deal: number | null; vendors: { vendor_key: string; vendor: string }[] }
const route = useRoute(), router = useRouter()
const pid = computed(() => (typeof route.query.p === 'string' ? route.query.p : undefined))
const tab = computed(() => (['channels', 'campaigns', 'design'].includes(String(route.query.t)) ? String(route.query.t) : 'dashboard'))
const go = (q: Record<string, string | undefined>) => router.replace({ query: { ...route.query, ...q } })
const { sf, cust, isGroup } = await useCoScope()
const { data, refresh } = await useFetch<D>('/api/marketing', { query: computed(() => ({ p: pid.value, cust: cust.value })) })
const d = computed(() => data.value), p = computed(() => d.value?.process ?? null), st = computed(() => d.value?.stats ?? null)
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['admin', 'gp'].includes(r)))
const m = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, p.value?.currency ?? 'USD'))
const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en-US'))
const mon = (ym: string) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const msg = ref(''), ok = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
const aiText = ref(''), aiBudget = ref<number | ''>(''), aiBusy = ref(false), imp = ref(false)
async function aiCreate() {
  aiBusy.value = true; msg.value = ''
  try { const r = await sf<{ stages: unknown[]; channels: { name: string; monthly_budget: number | null }[] }>('/api/growth/ai', { method: 'POST', body: { task: 'marketing_process', description: aiText.value, budget: aiBudget.value || undefined } })
    const c = await sf<{ id: string }>('/api/marketing/process', { method: 'POST', body: { stages: r.stages, channels: r.channels.map((x) => ({ name: x.name, monthly_budget: x.monthly_budget, vendor_keys: [] })) } }); await go({ p: c.id, t: 'design' }); await refresh() }
  catch (e) { msg.value = err(e) } finally { aiBusy.value = false }
}
// Write a campaign's goal, checklist and brief with AI from its name, channel and notes.
const cBusy = ref(false)
async function aiCampaign() {
  cBusy.value = true; msg.value = ''
  try { const r = await sf<{ goal: string; steps: string[]; brief: string }>('/api/growth/ai', { method: 'POST', body: { task: 'campaign', name: cf.name, channel: chName(cf.channel_key), goal: cf.goal, description: cf.notes } })
    cf.goal = r.goal.slice(0, 300); cf.steps = r.steps.map((t) => ({ text: t.slice(0, 200), done: false })); cf.notes = (r.brief + (cf.notes ? '\n\n' + cf.notes : '')).slice(0, 4000) }
  catch (e) { msg.value = err(e) } finally { cBusy.value = false }
}
async function create() { try { const r = await sf<{ id: string }>('/api/marketing/process', { method: 'POST', body: {} }); await go({ p: r.id, t: 'design' }); await refresh() } catch (e) { msg.value = err(e) } }
// Plan next month: a budget per channel, defaulting to the channel's budget or its average spend.
const plan = reactive<Record<string, number>>({})
watch(() => st.value, (s) => { if (!s || !p.value) return; for (const c of s.channels) if (plan[c.key] === undefined) plan[c.key] = p.value.channels.find((x) => x.key === c.key)?.monthly_budget ?? Math.round(c.spend / Math.max(1, s.months)) }, { immediate: true })
// Predictions use the last six months, so channels with little history borrow the average.
const pred = computed(() => (d.value?.stats6 ? predictBudget(d.value.stats6.channels, plan, d.value.stats6.months, d.value.avg_deal) : null))
async function saveBudgets() {
  try { await sf('/api/marketing/process', { method: 'POST', body: { id: p.value!.id, channels: p.value!.channels.map((c) => ({ ...c, monthly_budget: plan[c.key] ?? c.monthly_budget })) } }); ok.value = 'Saved as each channel\'s monthly budget.'; await refresh() } catch (e) { msg.value = err(e) }
}
// Channels by month.
const ch = ref(''); watch(p, (x) => { if (x && !x.channels.some((c) => c.key === ch.value)) ch.value = x.channels[0]?.key ?? '' }, { immediate: true })
const rowsOf = computed(() => (d.value?.rows ?? []).filter((r) => r.channel_key === ch.value))
const FIELDS: [keyof ChannelMonth, string, boolean][] = [['spend', 'Spend', true], ['visitors', 'Visitors', false], ['leads', 'Leads', false], ['mqls', 'Marketing qualified', false], ['sqls', 'Sales qualified', false], ['customers', 'Customers', false], ['revenue', 'Revenue', true]]
async function saveRow(r: Row, k: keyof ChannelMonth, ev: Event) {
  const v = (ev.target as HTMLInputElement).value
  const body: Record<string, unknown> = { process_id: p.value!.id, channel_key: r.channel_key, month: r.month }
  for (const [f] of FIELDS) body[f] = f === k ? v : r.auto.includes(f) ? null : r[f]
  try { await sf('/api/marketing/month', { method: 'POST', body }); await refresh() } catch (e) { msg.value = err(e) }
}
// Campaigns.
const blank = () => ({ id: '', name: '', channel_key: '' as string | null, status: 'planned' as Camp['status'], starts_on: '', ends_on: '', budget: '' as number | '', spend: '' as number | '', leads: '' as number | '', customers: '' as number | '', goal: '', steps: [] as { text: string; done: boolean }[], notes: '', newStep: '' })
const cf = reactive({ open: false, ...blank() })
function editC(c?: Camp) { Object.assign(cf, blank(), c ? { ...c, channel_key: c.channel_key ?? '', starts_on: c.starts_on ?? '', ends_on: c.ends_on ?? '', budget: c.budget ?? '', spend: c.spend ?? '', leads: c.leads ?? '', customers: c.customers ?? '', goal: c.goal ?? '', notes: c.notes ?? '', steps: structuredClone(toRaw(c.steps)) } : { steps: [{ text: 'Brief and audience agreed', done: false }, { text: 'Creative and landing page ready', done: false }, { text: 'Tracking set up', done: false }, { text: 'Launched', done: false }, { text: 'Results reviewed', done: false }] }, { open: true }); msg.value = '' }
async function saveC(del = false) {
  if (del && !await askConfirm('Delete the campaign "' + cf.name + '"?')) return
  try { const { open, newStep, ...b } = cf; void open; void newStep; await sf('/api/marketing/campaign', { method: 'POST', body: del ? { id: cf.id, delete: true } : { ...b, id: b.id || undefined, process_id: p.value!.id, channel_key: b.channel_key || null } }); cf.open = false; await refresh() } catch (e) { msg.value = err(e) }
}
const chName = (k: string | null) => p.value?.channels.find((c) => c.key === k)?.name ?? '—'
const maxF = computed(() => Math.max(1, ...(st.value?.funnel ?? []).map((f) => f.value)))
</script>
<template>
  <section class="mk">
    <div class="hd"><div><ScopeSwitch page="Marketing" /><p class="lead">Design your funnel and channels, track each channel's month, run campaigns, and see what a budget should bring in. Spend comes in from Banking and customers from won deals in Sales.</p></div>
      <div v-if="canEdit && p" class="tb"><button class="btn" @click="go({ t: 'campaigns' }); editC()">New campaign</button></div></div>
    <p v-if="msg && !cf.open" class="error">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>
    <ClientOnly><PendingUpdates v-if="p" kind="marketing_months" :process-id="p.id" what="channel results" @done="refresh()" /></ClientOnly>
    <div v-if="d && !p" class="empty"><h2>Set up your marketing process</h2><p>A starting funnel (visitors, leads, marketing qualified, sales qualified, customers) and six common channels, ready to rename. Add each channel's budget and the bank vendors you pay for it, and the dashboard works out cost per lead, CAC and return.</p>
      <div class="aic"><b><AiSpark /> Or describe your customers and let AI draft it</b><textarea v-model="aiText" rows="3" maxlength="3000" placeholder="e.g. Founders of seed-stage startups in Lagos and Nairobi; we find them on LinkedIn, at events and through accelerators." /><div class="row"><label class="sm">Monthly budget<input v-model.number="aiBudget" type="number" min="0"></label><button class="btn secondary" :disabled="!canEdit || aiBusy" @click="aiCreate">{{ aiBusy ? 'Drafting…' : 'Build with AI' }}</button></div></div>
      <button class="btn" :disabled="!canEdit" @click="create">Set up the standard funnel</button></div>
    <template v-if="p && d && st">
      <nav v-if="d.processes.length > 1" class="pt"><button v-for="x in d.processes" :key="x.id" :class="{ on: x.id === p.id }" @click="go({ p: x.id })">{{ isGroup ? x.company + ' · ' + x.name : x.name }}</button></nav>
      <nav class="tabs"><button v-for="[k, l] in ([['dashboard', 'Dashboard'], ['channels', 'Channels by month'], ['campaigns', 'Campaigns'], ['design', 'Process design']] as const)" :key="k" :class="{ on: tab === k }" @click="go({ t: k === 'dashboard' ? undefined : k })">{{ l }}</button></nav>
      <template v-if="tab === 'dashboard'">
        <div v-if="isGroup && d.rollup" class="card"><div class="ch"><h2>Across the group</h2><span class="mut">Every company's marketing, last three full months, totals in {{ d.rollup.currency }}</span></div>
          <table class="t" data-nosearch><thead><tr><th>Process</th><th>Company</th><th class="r">Spend</th><th class="r">Leads</th><th class="r">New customers</th><th class="r">Revenue from them</th></tr></thead>
            <tbody><tr v-for="r in d.rollup.rows" :key="r.id" class="cl" @click="go({ p: r.id })"><td><b>{{ r.name }}</b></td><td>{{ r.company }}</td><td class="r">{{ briefMoney(r.spend, r.currency) }}</td><td class="r">{{ n(r.leads) }}</td><td class="r">{{ n(r.customers) }}</td><td class="r">{{ briefMoney(r.revenue, r.currency) }}</td></tr>
              <tr class="tot"><td>Group total</td><td /><td class="r">{{ briefMoney(d.rollup.total.spend, d.rollup.currency) }}</td><td class="r">{{ n(d.rollup.total.leads) }}</td><td class="r">{{ n(d.rollup.total.customers) }}</td><td class="r">{{ briefMoney(d.rollup.total.revenue, d.rollup.currency) }}</td></tr></tbody></table>
          <p class="mut">Below: {{ p.company }} · {{ p.name }}.</p></div>
        <p class="mut">Last {{ st.months }} full months.</p>
        <div class="fx-stats"><StatTile label="Spend" :value="m(st.totals.spend)" /><StatTile label="Leads" :value="n(st.totals.leads)" :note="st.totals.cpl ? m(st.totals.cpl) + ' a lead' : ''" /><StatTile label="New customers" :value="n(st.totals.customers)" :note="st.totals.cac ? m(st.totals.cac) + ' to acquire each' : ''" /><StatTile label="Revenue from them" :value="m(st.totals.revenue)" /></div>
        <div class="two">
          <div class="card"><div class="ch"><h2>Funnel</h2></div><div class="fn"><div v-for="f in st.funnel" :key="f.name"><span>{{ f.name }}</span><i><em :style="{ width: f.value / maxF * 100 + '%' }" /></i><b>{{ n(f.value) }}</b><small>{{ f.conv === null ? '' : f.conv + '%' }}</small></div></div></div>
          <div class="card"><div class="ch"><h2>Plan next month</h2><span class="mut">Budget per channel → what it should bring in</span></div>
            <table v-if="pred" class="t" data-nosearch><thead><tr><th>Channel</th><th class="r">Budget</th><th class="r">Leads</th><th class="r">Customers</th><th class="r">Revenue</th></tr></thead>
              <tbody><tr v-for="r in pred.rows" :key="r.key"><td>{{ r.name }}<small>at {{ r.basis }} rates</small></td><td class="r"><input v-model.number="plan[r.key]" type="number" min="0" class="bi" :aria-label="'Budget for ' + r.name"></td><td class="r">{{ n(r.leads) }}</td><td class="r">{{ r.customers }}</td><td class="r">{{ m(r.revenue) }}</td></tr>
                <tr class="tot"><td>Total</td><td class="r">{{ m(pred.total.budget) }}</td><td class="r">{{ n(pred.total.leads) }}</td><td class="r">{{ pred.total.customers }}</td><td class="r">{{ m(pred.total.revenue) }}</td></tr></tbody></table>
            <div class="row"><button v-if="canEdit" class="btn secondary sm" @click="saveBudgets">Save as monthly budgets</button><span class="mut">{{ d.avg_deal ? 'Revenue at the average won deal (' + m(d.avg_deal) + ').' : 'Win deals in Sales to estimate revenue.' }}</span></div></div>
        </div>
        <div class="card"><div class="ch"><h2>By channel</h2></div>
          <table class="t" data-nosearch><thead><tr><th>Channel</th><th class="r">Spend</th><th class="r">Budget a month</th><th class="r">Leads</th><th class="r">Cost a lead</th><th class="r">Customers</th><th class="r">CAC</th><th class="r">Lead → customer</th><th class="r">Return</th></tr></thead>
            <tbody><tr v-for="c in st.channels" :key="c.key"><td>{{ c.name }}</td><td class="r">{{ m(c.spend) }}</td><td class="r">{{ m(c.budget) }}</td><td class="r">{{ n(c.leads) }}</td><td class="r">{{ m(c.cpl) }}</td><td class="r">{{ n(c.customers) }}</td><td class="r">{{ m(c.cac) }}</td><td class="r">{{ c.lead_to_customer === null ? '—' : c.lead_to_customer + '%' }}</td><td class="r" :class="{ neg: (c.roi ?? 0) < 0 }">{{ c.roi === null ? '—' : c.roi + '%' }}</td></tr></tbody></table></div>
      </template>

      <template v-if="tab === 'channels'">
        <div class="pt"><button v-for="c in p.channels" :key="c.key" :class="{ on: ch === c.key }" @click="ch = c.key">{{ c.name }}</button><span class="sp" /><button v-if="canEdit" class="btn secondary sm" @click="imp = true">Import results</button></div>
        <div class="card pad0"><table class="t" data-nosearch><thead><tr><th>Month</th><th v-for="[k, l] in FIELDS" :key="k" class="r">{{ l }}</th></tr></thead>
          <tbody><tr v-for="r in rowsOf" :key="r.month"><td>{{ mon(r.month) }}</td><td v-for="[k] in FIELDS" :key="k" class="r"><input class="ci" :class="{ au: r.auto.includes(k) }" :value="r[k] ?? ''" inputmode="decimal" :aria-label="k + ' ' + r.month" :title="r.auto.includes(k) ? (k === 'spend' ? 'From Banking' : 'From won deals in Sales') : ''" @change="saveRow(r, k, $event)"></td></tr></tbody></table></div>
        <p class="mut">Blue figures come in automatically (spend from the bank vendors set for the channel, customers and revenue from won deals with this source). Type over one to replace it.</p>
      </template>

      <template v-if="tab === 'campaigns'">
        <div class="card pad0"><table class="t" data-nosearch><thead><tr><th>Campaign</th><th>Channel</th><th>Dates</th><th class="r">Budget</th><th class="r">Spend</th><th class="r">Leads</th><th class="r">Customers</th><th>Checklist</th><th>Status</th></tr></thead>
          <tbody><tr v-for="c in d.campaigns" :key="c.id" class="cl" @click="editC(c)"><td><b>{{ c.name }}</b><small v-if="c.goal">{{ c.goal }}</small></td><td>{{ chName(c.channel_key) }}</td><td class="nw">{{ c.starts_on ?? '—' }}{{ c.ends_on ? ' → ' + c.ends_on : '' }}</td><td class="r">{{ m(c.budget) }}</td><td class="r" :class="{ neg: c.budget !== null && (c.spend ?? 0) > c.budget }">{{ m(c.spend) }}</td><td class="r">{{ n(c.leads) }}</td><td class="r">{{ n(c.customers) }}</td><td>{{ c.steps.filter((s) => s.done).length }}/{{ c.steps.length }}</td><td>{{ c.status === 'live' ? 'Live' : c.status === 'done' ? 'Done' : 'Planned' }}</td></tr></tbody></table>
          <p v-if="!d.campaigns.length" class="mut padx">No campaigns yet.</p></div>
      </template>
      <ProcessEditor v-if="tab === 'design'" :process="p" kind="marketing" :vendors="d.vendors" :can-edit="canEdit" @saved="refresh()" @deleted="go({ p: undefined, t: undefined }); refresh()" />
    </template>
    <SheetImport v-if="p" :open="imp" kind="marketing_months" :process-id="p.id" @close="imp = false" @done="refresh()" />
    <AppModal :open="cf.open" :title="cf.id ? cf.name : 'New campaign'" wide @close="cf.open = false">
      <div class="frm"><label>Name<input v-model="cf.name" maxlength="160"></label><label>Channel<select v-model="cf.channel_key"><option value="">—</option><option v-for="c in p?.channels ?? []" :key="c.key" :value="c.key">{{ c.name }}</option></select></label>
        <label>Starts<input v-model="cf.starts_on" type="date"></label><label>Ends<input v-model="cf.ends_on" type="date"></label>
        <label>Budget<input v-model.number="cf.budget" type="number" min="0"></label><label>Spent so far<input v-model.number="cf.spend" type="number" min="0"></label>
        <label>Leads<input v-model.number="cf.leads" type="number" min="0"></label><label>Customers<input v-model.number="cf.customers" type="number" min="0"></label>
        <div class="w"><button class="btn secondary sm" :disabled="cBusy || !cf.name.trim()" @click="aiCampaign"><AiSpark /> {{ cBusy ? 'Writing…' : 'Write the goal, checklist and brief with AI' }}</button></div>
        <label class="w">Goal<input v-model="cf.goal" maxlength="300" placeholder="e.g. 200 sign-ups from fintech founders in Lagos"></label>
        <label>Status<select v-model="cf.status"><option value="planned">Planned</option><option value="live">Live</option><option value="done">Done</option></select></label><span />
        <div class="w ck"><span>Checklist</span><label v-for="(s, i) in cf.steps" :key="i"><input v-model="s.done" type="checkbox"> {{ s.text }} <button class="lk red" type="button" @click="cf.steps.splice(i, 1)">×</button></label>
          <form class="ad" @submit.prevent="cf.newStep.trim() && (cf.steps.push({ text: cf.newStep.trim(), done: false }), cf.newStep = '')"><input v-model="cf.newStep" maxlength="200" placeholder="Add a step"><button class="btn secondary sm" type="submit">Add</button></form></div>
        <label class="w">Brief and notes<textarea v-model="cf.notes" rows="6" maxlength="4000" /></label><p v-if="msg" class="error w">{{ msg }}</p></div>
      <template #foot><button v-if="cf.id" class="btn secondary" @click="saveC(true)">Delete</button><span class="sp" /><button class="btn secondary" @click="cf.open = false">Cancel</button><button class="btn" :disabled="!cf.name.trim()" @click="saveC()">Save</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.mk { display: flex; flex-direction: column; gap: 16px; } .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 680px; } .tb { display: flex; gap: 8px; }
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--c-rule); } .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 14px; font: inherit; font-size: 14px; color: var(--c-muted); cursor: pointer; margin-bottom: -1px; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); font-weight: 500; }
.pt { display: flex; gap: 6px; flex-wrap: wrap; } .pt button { font: inherit; font-size: 13px; padding: 5px 12px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; } .pt button.on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.fx-stats { margin: 0; } .card h2 { margin: 0; font-size: 16px; } .ch { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .pad0 { padding: 0; overflow-x: auto; } .padx { padding: 14px; }
.two { display: grid; grid-template-columns: 1fr 1.2fr; gap: 16px; } @media (max-width: 960px) { .two { grid-template-columns: 1fr; } }
.fn > div { display: grid; grid-template-columns: 130px 1fr 70px 50px; gap: 10px; align-items: center; font-size: 13px; padding: 5px 0; } .fn i { height: 12px; background: #eef1f5; display: block; } .fn i em { display: block; height: 100%; background: var(--c-navy); } .fn b { text-align: right; font-weight: 500; } .fn small { color: var(--c-muted); font-size: 12px; }
.t { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } .t td { padding: 7px 10px; border-bottom: 1px solid var(--c-rule); } .t .r { text-align: right; } .t small { display: block; color: var(--c-muted); font-size: 11.5px; } .t .neg { color: var(--c-danger); } .t .nw { white-space: nowrap; } .t tr.tot td { font-weight: 600; } .t tr.cl { cursor: pointer; } .t tr.cl:hover td { background: #f7f8fb; }
.bi { width: 100px; font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid var(--c-rule-strong); text-align: right; } .ci { width: 96px; font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid var(--c-rule); text-align: right; } .ci.au { color: var(--c-blue-deep); background: #f3f7fb; }
.row { display: flex; gap: 12px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.empty { background: #fff; border: 1px solid var(--c-rule); padding: 20px; } .empty h2 { margin: 0 0 6px; font-size: 18px; } .empty p { margin: 0 0 14px; color: var(--c-ink-soft); font-size: 14px; max-width: 720px; }
.frm { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .frm label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } .frm .w { grid-column: 1 / -1; }
.frm input:not([type="checkbox"]), .frm select, .frm textarea { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; }
.ck { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--c-rule); padding: 10px 12px; } .ck > span { font-weight: 500; font-size: 13px; } .ck label { flex-direction: row; align-items: center; gap: 8px; } .ad { display: flex; gap: 8px; } .ad input { flex: 1; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); } .sp { flex: 1; }
.aic { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--c-rule); background: #f7f9fc; padding: 14px; margin-bottom: 12px; } .aic b { display: flex; gap: 6px; align-items: center; font-weight: 600; } .aic textarea, .aic input { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); } .aic .sm { display: flex; gap: 8px; align-items: center; font-size: 13px; } .aic .sm input { width: 120px; } .pt { align-items: center; }
.t tr.tot td { font-weight: 600; border-top: 1px solid var(--c-rule-strong); } .t tr.cl { cursor: pointer; } .t tr.cl:hover { background: var(--c-paper-3); }
</style>
