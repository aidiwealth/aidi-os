<script setup lang="ts">
// Sales: design the company's sales process, run deals through it, and see what it predicts — conversion against the
// targets, win rate, cycle, the weighted pipeline, expected wins by month, and what the monthly target needs.
import type { Process, SalesStats } from '~/shared/growth'
useHead({ title: 'Sales' })
interface DealRow { id: string; name: string; contact: string | null; value: number | null; recurring: boolean; stage_key: string; owner_id: string | null; source_channel: string | null; expected_close: string | null; steps_done: Record<string, number[]>; notes: string | null; lost_reason: string | null; closed_at: string | null; created_at: string; updated_at: string; deal_type?: string; customer_key?: string | null; customer_name?: string | null }
interface D { split?: Record<string, number>; processes: { id: string; name: string; company: string }[]; rollup: { currency: string; rows: { id: string; name: string; company: string; currency: string; open: number; weighted: number; won_90d: number; win_rate: number | null; deals: number }[]; total: { open: number; weighted: number; won_90d: number } } | null; process: (Process & { company?: string }) | null; deals: DealRow[]; stats: SalesStats | null; people: { id: string; name: string }[]; channels: { key: string; name: string }[]; templates: { key: string; label: string }[] }
const route = useRoute(), router = useRouter()
const pid = computed(() => (typeof route.query.p === 'string' ? route.query.p : undefined))
const tab = computed(() => (['pipeline', 'design'].includes(String(route.query.t)) ? String(route.query.t) : 'dashboard'))
const go = (q: Record<string, string | undefined>) => router.replace({ query: { ...route.query, ...q } })
const { sf, cust, isGroup } = await useCoScope()
const { data, refresh } = await useFetch<D>('/api/sales', { query: computed(() => ({ p: pid.value, cust: cust.value })) })
const d = computed(() => data.value), p = computed(() => d.value?.process ?? null), st = computed(() => d.value?.stats ?? null)
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['admin', 'gp'].includes(r)))
const m = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, p.value?.currency ?? 'USD'))
const mon = (ym: string) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const msg = ref(''), ok = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
// A new process from a template.
const nw = reactive({ open: false, template: 'b2b', name: '' })
// Build the first process with AI from how the founder describes their sales.
const aiText = ref(''), aiBusy = ref(false)
async function aiCreate() {
  aiBusy.value = true; msg.value = ''
  try { const r = await sf<{ name: string; stages: unknown[] }>('/api/growth/ai', { method: 'POST', body: { task: 'sales_process', description: aiText.value } }); const c = await sf<{ id: string }>('/api/sales/process', { method: 'POST', body: { name: r.name, stages: r.stages } }); await go({ p: c.id, t: 'design' }); await refresh() }
  catch (e) { msg.value = err(e) } finally { aiBusy.value = false }
}
const imp = ref(false)
// The next move on a deal, drafted with AI: steps and an email to the contact.
const nx = reactive({ busy: false, steps: [] as string[], subject: '', email: '', copied: false })
async function aiNext() { nx.busy = true; msg.value = ''; try { const r = await sf<{ next_steps: string[]; subject: string; email: string }>('/api/growth/ai', { method: 'POST', body: { task: 'deal_next', deal_id: f.id } }); Object.assign(nx, { steps: r.next_steps, subject: r.subject, email: r.email, copied: false }) } catch (e) { msg.value = err(e) } finally { nx.busy = false } }
async function copyEmail() { try { await navigator.clipboard.writeText('Subject: ' + nx.subject + '\n\n' + nx.email); nx.copied = true } catch { /* ignore */ } }
async function create() { try { const r = await sf<{ id: string }>('/api/sales/process', { method: 'POST', body: { template: nw.template, name: nw.name || undefined } }); nw.open = false; await go({ p: r.id, t: 'design' }); await refresh() } catch (e) { msg.value = err(e) } }
// Deals.
const blank = () => ({ id: '', name: '', deal_type: 'new' as 'new' | 'expansion' | 'renewal', customer_key: '' as string | null, customer_name: '' as string | null, contact: '', value: '' as number | '', recurring: false, stage_key: '', owner_id: '' as string | null, source_channel: '' as string | null, expected_close: '', notes: '', lost_reason: '' })
const f = reactive({ open: false, ...blank() }), busy = ref(false)
const cur = computed(() => d.value?.deals.find((x) => x.id === f.id) ?? null)
function edit(x?: DealRow, stage?: string) { Object.assign(nx, { steps: [], subject: '', email: '' }); Object.assign(f, blank(), x ? { ...x, value: x.value ?? '', contact: x.contact ?? '', expected_close: x.expected_close ?? '', notes: x.notes ?? '', lost_reason: x.lost_reason ?? '', owner_id: x.owner_id ?? '', source_channel: x.source_channel ?? '', customer_key: x.customer_key ?? '', customer_name: x.customer_name ?? '', deal_type: (x.deal_type ?? 'new') as 'new' | 'expansion' | 'renewal' } : { stage_key: stage ?? p.value?.stages.find((s) => s.kind === 'open')?.key ?? '' }, { open: true }); msg.value = '' }
async function saveDeal() {
  busy.value = true; msg.value = ''
  try { await sf('/api/sales/deal', { method: 'POST', body: { id: f.id || undefined, process_id: p.value!.id, name: f.name, contact: f.contact, value: f.value, recurring: f.recurring, stage_key: f.stage_key, owner_id: f.owner_id || null, source_channel: f.source_channel || null, expected_close: f.expected_close || null, notes: f.notes, lost_reason: f.lost_reason, deal_type: f.deal_type, customer_key: f.customer_key || null, customer_name: f.customer_key ? cs.value?.customers.find((c) => c.key === f.customer_key)?.name ?? f.customer_name : f.customer_name || null } }); f.open = false; await refresh() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
// Customers from Financials: key accounts to grow or renew through the pipeline, and won new deals to add as customers.
interface CS { enabled: boolean; currency: string; as_of: string | null; customers: { key: string; name: string; segment: string | null; monthly: number; year: number; open_deals: number }[]; won_not_customers: { id: string; name: string; customer_name: string | null; value: number | null; closed_at: string | null; process: string }[] }
const cs = ref<CS | null>(null)
async function loadCs() { try { cs.value = await sf<CS>('/api/sales/customers') } catch { cs.value = null } }
watch(cust, loadCs, { immediate: true })
const ka = reactive({ open: false, picked: [] as string[], type: 'expansion' as 'expansion' | 'renewal', uplift: 20, q: '' })
const kaList = computed(() => (cs.value?.customers ?? []).filter((c) => !ka.q || c.name.toLowerCase().includes(ka.q.toLowerCase())))
const cm = (v: number) => briefMoney(v, cs.value?.currency ?? 'USD')
async function addKeyAccounts() {
  busy.value = true; msg.value = ''
  try { const r = await sf<{ added: number; skipped: number }>('/api/sales/key-accounts', { method: 'POST', body: { process_id: p.value!.id, keys: ka.picked, deal_type: ka.type, uplift_pct: ka.uplift } }); ka.open = false; ka.picked = []; ok.value = r.added + ' key-account deal' + (r.added === 1 ? '' : 's') + ' added' + (r.skipped ? ' (' + r.skipped + ' already had an open deal)' : '') + '.'; await refresh(); await loadCs() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const wc = reactive({ open: false, picked: [] as string[] })
async function toCustomers() {
  busy.value = true; msg.value = ''
  try { const r = await sf<{ added: number }>('/api/sales/to-customers', { method: 'POST', body: { deal_ids: wc.picked } }); wc.open = false; ok.value = r.added + ' customer' + (r.added === 1 ? '' : 's') + ' added to Financials.'; await loadCs(); await refresh() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
async function delDeal() { if (!await askConfirm('Delete the deal "' + f.name + '"?')) return; await sf('/api/sales/deal', { method: 'POST', body: { id: f.id, delete: true } }); f.open = false; await refresh() }
async function moveTo(x: DealRow, stage: string) { try { await sf('/api/sales/deal', { method: 'POST', body: { id: x.id, stage_key: stage } }); await refresh() } catch (e) { msg.value = err(e) } }
async function step(stage: string, i: number, done: boolean) { if (!f.id) return; await sf('/api/sales/deal', { method: 'POST', body: { id: f.id, step: { stage, i, done } } }); await refresh() }
// Drag a card to another column.
const drag = ref<string | null>(null)
function drop(stage: string) { const x = d.value?.deals.find((y) => y.id === drag.value); drag.value = null; if (x && x.stage_key !== stage) void moveTo(x, stage) }
const cols = computed(() => (p.value?.stages ?? []).map((s) => ({ ...s, deals: (d.value?.deals ?? []).filter((x) => x.stage_key === s.key), value: (d.value?.deals ?? []).filter((x) => x.stage_key === s.key).reduce((t, x) => t + (x.value ?? 0), 0) })))
const who = (id: string | null) => d.value?.people.find((x) => x.id === id)?.name ?? ''
const stageOf = (k: string) => p.value?.stages.find((s) => s.key === k)
const maxFc = computed(() => Math.max(1, ...(st.value?.forecast ?? []).map((x) => x.expected)))
const late = (x: DealRow) => x.expected_close && x.expected_close < new Date().toISOString().slice(0, 10) && stageOf(x.stage_key)?.kind === 'open'
</script>
<template>
  <section class="sl">
    <div class="hd"><div><ScopeSwitch page="Sales" /><p class="lead">Run deals through your sales process and see what it will close.</p></div>
      <div v-if="canEdit" class="tb"><button v-if="p" class="btn secondary" @click="imp = true">Import deals</button><button v-if="p && cs?.customers.length" class="btn secondary" @click="ka.open = true">Key accounts</button><button class="btn secondary" @click="nw.open = true">New process</button><button v-if="p" class="btn" @click="go({ t: 'pipeline' }); edit()">Add a deal</button></div></div>
    <p v-if="msg && !f.open" class="error">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>
    <ClientOnly><PendingUpdates v-if="p" kind="sales_deals" :process-id="p.id" what="deals" @done="refresh()" /></ClientOnly>
    <div v-if="d && !p" class="empty"><h2>Set up your sales process</h2><p>Draft one with AI or start from a template, then adjust the stages.</p>
      <div class="aic"><b><AiSpark /> Describe how you sell and let AI draft it</b><textarea v-model="aiText" rows="3" maxlength="3000" placeholder="e.g. We sell a messaging API to banks and fintechs in Nigeria. Leads come from referrals and outbound; a technical demo, then a pilot, then procurement and a contract." /><div><button class="btn" :disabled="!canEdit || aiBusy" @click="aiCreate">{{ aiBusy ? 'Drafting…' : 'Build with AI' }}</button></div></div>
      <p class="or">Or start from a template</p>
      <div class="tpl"><button v-for="t in d.templates" :key="t.key" class="opt" :disabled="!canEdit" @click="nw.template = t.key; create()"><b>{{ t.label }}</b><span>{{ t.key === 'b2b' ? 'Lead, qualified, demo, proposal, negotiation' : t.key === 'self_serve' ? 'Sign-up, activated, trial, paying' : 'Target account, meeting, pilot, commercials, contract' }}</span></button></div></div>
    <template v-if="p && d && st">
      <div class="bar"><nav v-if="d.processes.length > 1" class="pt"><button v-for="x in d.processes" :key="x.id" :class="{ on: x.id === p.id }" @click="go({ p: x.id })">{{ isGroup ? x.company + ' · ' + x.name : x.name }}</button></nav>
        <nav class="tabs"><button v-for="[k, l] in ([['dashboard', 'Dashboard'], ['pipeline', 'Pipeline'], ['design', 'Process design']] as const)" :key="k" :class="{ on: tab === k }" @click="go({ t: k === 'dashboard' ? undefined : k })">{{ l }}</button></nav></div>

      <template v-if="tab === 'dashboard'">
        <div v-if="isGroup && d.rollup" class="card"><div class="ch"><h2>Across the group</h2><span class="mut">Totals in {{ d.rollup.currency }}</span></div>
          <table class="t" data-nosearch><thead><tr><th>Process</th><th>Company</th><th class="r">Deals</th><th class="r">Open pipeline</th><th class="r">Weighted</th><th class="r">Won, last 90 days</th><th class="r">Win rate</th></tr></thead>
            <tbody><tr v-for="r in d.rollup.rows" :key="r.id" class="cl" @click="go({ p: r.id })"><td><b>{{ r.name }}</b></td><td>{{ r.company }}</td><td class="r">{{ r.deals }}</td><td class="r">{{ briefMoney(r.open, r.currency) }}</td><td class="r">{{ briefMoney(r.weighted, r.currency) }}</td><td class="r">{{ briefMoney(r.won_90d, r.currency) }}</td><td class="r">{{ r.win_rate === null ? '—' : r.win_rate + '%' }}</td></tr>
              <tr class="tot"><td>Group total</td><td /><td /><td class="r">{{ briefMoney(d.rollup.total.open, d.rollup.currency) }}</td><td class="r">{{ briefMoney(d.rollup.total.weighted, d.rollup.currency) }}</td><td class="r">{{ briefMoney(d.rollup.total.won_90d, d.rollup.currency) }}</td><td /></tr></tbody></table>
          <p class="mut">Below: {{ p.company }} · {{ p.name }}</p></div>
        <div class="fx-stats">
          <StatTile label="Open pipeline" :value="m(st.open_value)" :note="st.stages.filter((s) => s.kind === 'open').reduce((t, s) => t + s.now, 0) + ' open deals'" />
          <StatTile label="Expected to close" :value="m(st.weighted)" note="Weighted by stage" />
          <StatTile label="Win rate" :value="st.win_rate === null ? '—' : st.win_rate + '%'" :note="st.won + ' won · ' + st.lost + ' lost'" />
          <StatTile label="Average deal" :value="m(st.avg_won)" :note="st.cycle_days ? 'Closes in about ' + Math.round(st.cycle_days) + ' days' : ''" />
        </div>
        <div v-if="d.split && (d.split.expansion || d.split.renewal)" class="hb">Open pipeline: <b>{{ m(d.split.new) }}</b> new business · <b>{{ m(d.split.expansion + d.split.renewal) }}</b> from existing customers (growing spend {{ m(d.split.expansion) }}, renewals {{ m(d.split.renewal) }}).</div>
        <div v-if="canEdit && cs?.won_not_customers.length" class="hb">{{ cs.won_not_customers.length }} won deal{{ cs.won_not_customers.length === 1 ? ' is' : 's are' }} not in Financials yet. <button class="lk" @click="wc.picked = cs!.won_not_customers.map((x) => x.id); wc.open = true">Review and add</button></div>
        <div v-if="p.target_monthly" class="hb"><b>Target: {{ p.target_kind === 'revenue' ? m(p.target_monthly) + ' of new revenue' : p.target_monthly + ' deals' }} a month.</b>
          <template v-if="st.to_target?.deals_needed"> That takes about <b>{{ st.to_target.deals_needed }} won deals</b> a month, so roughly <b>{{ st.to_target.leads_needed }} new deals entering "{{ p.stages.find((s) => s.kind === 'open')?.name }}"</b> each month ({{ st.to_target.note }}).</template><template v-else> {{ st.to_target?.note ?? 'Win a few deals so the win rate is known.' }}</template>
          <template v-if="st.velocity_per_month"> At today's pace the pipeline closes about <b>{{ m(st.velocity_per_month) }}</b> a month.</template></div>
        <div v-else-if="canEdit" class="hb">Set a monthly target in <a href="#" @click.prevent="go({ t: 'design' })">Process design</a>.</div>
        <div class="card"><div class="ch"><h2>Conversion by stage</h2><span class="mut">Actual vs target · shows after three deals pass a stage</span></div>
          <table class="t" data-nosearch><thead><tr><th>Stage</th><th class="r">Reached</th><th class="r">In it now</th><th>Moves on: actual vs target</th><th class="r">Days: actual vs target</th></tr></thead>
            <tbody><tr v-for="s in st.stages.filter((x) => x.kind === 'open')" :key="s.key"><td>{{ s.name }}</td><td class="r">{{ s.reached }}</td><td class="r">{{ s.now }}<small>{{ m(s.value_now) }}</small></td>
              <td><div class="cv"><i><em :style="{ width: (s.actual_pct ?? 0) + '%' }" :class="{ lo: s.actual_pct !== null && s.target_pct !== null && s.actual_pct < s.target_pct }" /><b v-if="s.target_pct !== null" :style="{ left: s.target_pct + '%' }" /></i><span>{{ s.actual_pct === null ? '—' : s.actual_pct + '%' }} / {{ s.target_pct ?? '—' }}%</span></div></td>
              <td class="r" :class="{ neg: s.avg_days !== null && s.target_days !== null && s.avg_days > s.target_days }">{{ s.avg_days ?? '—' }} / {{ s.target_days ?? '—' }}</td></tr></tbody></table></div>
        <div class="two">
          <div class="card"><div class="ch"><h2>Expected wins</h2><span class="mut">Weighted, by close month</span></div>
            <div v-if="st.forecast.length" class="fc"><div v-for="x in st.forecast" :key="x.month"><span>{{ mon(x.month) }}</span><i><em :style="{ width: x.expected / maxFc * 100 + '%' }" /></i><b>{{ m(x.expected) }}</b></div></div><p v-else class="mut">No open deals yet.</p></div>
          <div class="card"><div class="ch"><h2>Won by month</h2></div>
            <div v-if="Object.keys(st.won_value_month).length" class="fc"><div v-for="k in Object.keys(st.won_value_month).sort().slice(-6)" :key="k"><span>{{ mon(k) }}</span><i><em :style="{ width: st.won_value_month[k]! / Math.max(...Object.values(st.won_value_month)) * 100 + '%' }" /></i><b>{{ m(st.won_value_month[k]) }}</b></div></div><p v-else class="mut">No deals won yet.</p></div>
        </div>
      </template>

      <template v-if="tab === 'pipeline'">
        <div class="kb"><div v-for="c in cols" :key="c.key" class="col" :class="c.kind" @dragover.prevent @drop="drop(c.key)"><div class="cth"><b>{{ c.name }}</b><span>{{ c.deals.length }} · {{ m(c.value) }}</span></div>
          <div v-for="x in c.deals" :key="x.id" class="dc" draggable="true" @dragstart="drag = x.id" @click="edit(x)"><b>{{ x.name }}</b><em v-if="x.deal_type && x.deal_type !== 'new'" class="ex">{{ x.deal_type === 'renewal' ? 'Renewal' : 'Existing customer' }}</em><span>{{ m(x.value) }}{{ x.recurring ? ' a month' : '' }}</span><small>{{ [who(x.owner_id), x.expected_close ? 'close ' + x.expected_close : ''].filter(Boolean).join(' · ') }}<em v-if="late(x)"> · late</em></small>
            <small v-if="c.kind === 'open' && c.steps.length" class="pg">{{ (x.steps_done[c.key] ?? []).length }}/{{ c.steps.length }} steps</small></div>
          <button v-if="c.kind === 'open'" class="lk add" @click="edit(undefined, c.key)">+ Add</button></div></div>
        <p class="mut">Drag a card to move it. <button v-if="canEdit" class="lk" @click="imp = true">Import deals</button></p>
      </template>
      <ProcessEditor v-if="tab === 'design'" :process="p" kind="sales" :can-edit="canEdit" @saved="refresh()" @deleted="go({ p: undefined, t: undefined }); refresh()" />
    </template>

    <AppModal :open="f.open" :title="f.id ? f.name : 'Add a deal'" wide @close="f.open = false">
      <div class="frm"><label>Deal or company<input v-model="f.name" maxlength="160"></label><label>Contact<input v-model="f.contact" maxlength="200" placeholder="Name, email"></label>
        <label>Value ({{ p?.currency }})<input v-model.number="f.value" type="number" min="0"></label><label class="cb"><input v-model="f.recurring" type="checkbox"> Value is a month (recurring)</label>
        <label>Type<select v-model="f.deal_type"><option value="new">New business</option><option value="expansion">Existing customer: grow spend</option><option value="renewal">Existing customer: renewal</option></select></label>
        <label v-if="f.deal_type !== 'new' && cs?.customers.length">Customer in Financials<select v-model="f.customer_key"><option value="">—</option><option v-for="c in cs.customers" :key="c.key" :value="c.key">{{ c.name }} · {{ cm(c.monthly) }} a month</option></select></label>
        <label v-else>Customer (company)<input v-model="f.customer_name" maxlength="200" placeholder="If different from the deal name"></label>
        <label>Stage<select v-model="f.stage_key"><option v-for="s in p?.stages ?? []" :key="s.key" :value="s.key">{{ s.name }}</option></select></label><label>Expected close<input v-model="f.expected_close" type="date"></label>
        <label>Owner<select v-model="f.owner_id"><option value="">—</option><option v-for="x in d?.people ?? []" :key="x.id" :value="x.id">{{ x.name }}</option></select></label>
        <label>Source<select v-model="f.source_channel"><option value="">—</option><option v-for="c in d?.channels ?? []" :key="c.key" :value="c.key">{{ c.name }}</option></select></label>
        <label v-if="stageOf(f.stage_key)?.kind === 'lost'" class="w">Why it was lost<input v-model="f.lost_reason" maxlength="300"></label>
        <div v-if="cur && stageOf(cur.stage_key)?.steps.length" class="w ck"><span>Steps in {{ stageOf(cur.stage_key)?.name }}</span><label v-for="(s, i) in stageOf(cur.stage_key)!.steps" :key="i"><input type="checkbox" :checked="(cur.steps_done[cur.stage_key] ?? []).includes(i)" @change="step(cur.stage_key, i, ($event.target as HTMLInputElement).checked)"> {{ s }}</label></div>
        <label class="w">Notes<textarea v-model="f.notes" rows="3" maxlength="4000" /></label>
        <div v-if="f.id" class="w nx"><button class="btn secondary sm" :disabled="nx.busy" @click="aiNext"><AiSpark /> {{ nx.busy ? 'Drafting…' : 'Next step and email with AI' }}</button>
          <template v-if="nx.email"><ul><li v-for="(s, i) in nx.steps" :key="i">{{ s }}</li></ul><div class="em"><b>{{ nx.subject }}</b><p>{{ nx.email }}</p><button class="lk" @click="copyEmail">{{ nx.copied ? 'Copied' : 'Copy email' }}</button></div></template></div>
        <p v-if="msg" class="error w">{{ msg }}</p></div>
      <template #foot><button v-if="f.id" class="btn secondary" @click="delDeal">Delete</button><span class="sp" /><button class="btn secondary" @click="f.open = false">Cancel</button><button class="btn" :disabled="busy || !f.name.trim()" @click="saveDeal">{{ busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
    <AppModal :open="ka.open" title="Key accounts from your customers" wide @close="ka.open = false">
      <div class="frm"><p class="w mut">Each customer picked becomes a deal in {{ p?.name }}{{ cs?.as_of ? ' (revenue to ' + cs.as_of + ')' : '' }}.</p>
        <label>Deal type<select v-model="ka.type"><option value="expansion">Grow spend</option><option value="renewal">Renewal</option></select></label><label v-if="ka.type === 'expansion'">Grow spend by (%)<input v-model.number="ka.uplift" type="number" min="0" max="1000"></label>
        <label class="w">Find<input v-model="ka.q" placeholder="Customer name"></label>
        <div class="w kl"><label v-for="c in kaList" :key="c.key" class="kr"><input v-model="ka.picked" type="checkbox" :value="c.key" :disabled="c.open_deals > 0"><span><b>{{ c.name }}</b><small>{{ cm(c.monthly) }} a month · {{ cm(c.year) }} last 12 months{{ c.segment ? ' · ' + c.segment : '' }}{{ c.open_deals ? ' · already in the pipeline' : '' }}</small></span></label></div></div>
      <template #foot><span class="sp" /><button class="btn secondary" @click="ka.open = false">Cancel</button><button class="btn" :disabled="busy || !ka.picked.length" @click="addKeyAccounts">Add {{ ka.picked.length || '' }} to the pipeline</button></template>
    </AppModal>
    <AppModal :open="wc.open" title="Add won deals to your customers" @close="wc.open = false">
      <div class="frm"><p class="w mut">Added from the month they were won. Untick any to skip.</p>
        <div class="w kl"><label v-for="x in cs?.won_not_customers ?? []" :key="x.id" class="kr"><input v-model="wc.picked" type="checkbox" :value="x.id"><span><b>{{ x.customer_name ?? x.name }}</b><small>{{ x.process }}{{ x.value ? ' · ' + m(x.value) : '' }}{{ x.closed_at ? ' · won ' + x.closed_at.slice(0, 10) : '' }}</small></span></label></div></div>
      <template #foot><span class="sp" /><button class="btn secondary" @click="wc.open = false">Not now</button><button class="btn" :disabled="busy || !wc.picked.length" @click="toCustomers">Add {{ wc.picked.length }} customer{{ wc.picked.length === 1 ? '' : 's' }}</button></template>
    </AppModal>
    <SheetImport v-if="p" :open="imp" kind="sales_deals" :process-id="p.id" @close="imp = false" @done="refresh()" />
    <AppModal :open="nw.open" title="New sales process" @close="nw.open = false">
      <div class="frm one"><label>Start from<select v-model="nw.template"><option v-for="t in d?.templates ?? []" :key="t.key" :value="t.key">{{ t.label }}</option></select></label><label>Name<input v-model="nw.name" maxlength="80" placeholder="e.g. Enterprise"></label></div>
      <template #foot><span class="sp" /><button class="btn secondary" @click="nw.open = false">Cancel</button><button class="btn" @click="create">Create</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.sl { display: flex; flex-direction: column; gap: 16px; } .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 640px; } .tb { display: flex; gap: 8px; }
.bar { display: flex; flex-direction: column; gap: 8px; } .pt { display: flex; gap: 6px; flex-wrap: wrap; } .pt button { font: inherit; font-size: 13px; padding: 5px 12px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; } .pt button.on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--c-rule); } .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 14px; font: inherit; font-size: 14px; color: var(--c-muted); cursor: pointer; margin-bottom: -1px; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); font-weight: 500; }
.fx-stats { margin: 0; } .hb { border: 1px solid var(--c-rule); background: #fff; padding: 12px 16px; font-size: 14px; color: var(--c-ink-soft); line-height: 1.6; } .hb a { color: var(--c-blue-deep); }
.card h2 { margin: 0; font-size: 16px; } .ch { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; }
.t { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); } .t td { padding: 8px 10px; border-bottom: 1px solid var(--c-rule); vertical-align: middle; } .t .r { text-align: right; } .t small { display: block; color: var(--c-muted); font-size: 11.5px; } .t .neg { color: var(--c-danger); }
.cv { display: flex; align-items: center; gap: 10px; } .cv i { position: relative; flex: 1; height: 9px; background: #eef1f5; display: block; min-width: 120px; } .cv i em { display: block; height: 100%; background: var(--c-navy); } .cv i em.lo { background: #8a96a8; } .cv i b { position: absolute; top: -3px; width: 2px; height: 15px; background: var(--c-danger); } .cv span { font-size: 12.5px; color: var(--c-ink-soft); min-width: 80px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; } @media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
.fc > div { display: grid; grid-template-columns: 80px 1fr 90px; gap: 10px; align-items: center; font-size: 13px; padding: 4px 0; } .fc i { height: 10px; background: #eef1f5; display: block; } .fc i em { display: block; height: 100%; background: var(--c-blue-deep); } .fc b { text-align: right; font-weight: 500; }
.kb { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; align-items: flex-start; } .col { min-width: 220px; flex: 1; background: #f5f6f8; border: 1px solid var(--c-rule); padding: 8px; display: flex; flex-direction: column; gap: 8px; min-height: 160px; } .col.won { background: #f1f5fa; } .col.lost { background: #f7f7f7; }
.cth { display: flex; flex-direction: column; gap: 2px; padding: 2px 2px 6px; } .cth b { font-size: 13.5px; } .cth span { font-size: 12px; color: var(--c-muted); }
.dc { background: #fff; border: 1px solid var(--c-rule); padding: 9px 10px; cursor: grab; display: flex; flex-direction: column; gap: 2px; } .dc:hover { border-color: var(--c-navy); } .dc b { font-size: 13.5px; font-weight: 500; } .dc span { font-size: 13px; color: var(--c-ink-soft); } .dc small { font-size: 11.5px; color: var(--c-muted); } .dc small em { font-style: normal; color: var(--c-danger); } .dc .pg { color: var(--c-blue-deep); }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; text-align: left; } .add { padding: 4px 2px; }
.empty { background: #fff; border: 1px solid var(--c-rule); padding: 20px; } .empty h2 { margin: 0 0 6px; font-size: 18px; } .empty p { margin: 0 0 14px; color: var(--c-ink-soft); font-size: 14px; max-width: 720px; }
.tpl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .opt { text-align: left; font: inherit; background: #fff; border: 1px solid var(--c-rule-strong); padding: 14px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; } .opt:hover { border-color: var(--c-navy); } .opt b { font-weight: 600; } .opt span { font-size: 13px; color: var(--c-muted); } @media (max-width: 760px) { .tpl { grid-template-columns: 1fr; } }
.frm { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .frm.one { grid-template-columns: 1fr; } .frm label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } .frm .w { grid-column: 1 / -1; } .frm .cb { flex-direction: row; align-items: center; gap: 8px; margin-top: 22px; }
.frm input:not([type="checkbox"]), .frm select, .frm textarea { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; }
.ck { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--c-rule); padding: 10px 12px; } .ck > span { font-weight: 500; font-size: 13px; } .ck label { flex-direction: row; align-items: center; gap: 8px; } .sp { flex: 1; }
.aic { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--c-rule); background: #f7f9fc; padding: 14px; margin-bottom: 6px; } .aic b { display: flex; gap: 6px; align-items: center; font-weight: 600; } .aic textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); }
.or { margin: 8px 0; font-size: 12.5px; color: var(--c-muted); } .nx { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; } .nx ul { margin: 0; padding-left: 18px; font-size: 13.5px; } .em { border: 1px solid var(--c-rule); padding: 10px 12px; width: 100%; } .em p { white-space: pre-line; margin: 6px 0; font-size: 13.5px; color: var(--c-ink-soft); }
.t tr.tot td { font-weight: 600; border-top: 1px solid var(--c-rule-strong); } .t tr.cl { cursor: pointer; } .t tr.cl:hover { background: var(--c-paper-3); }
.kl { max-height: 320px; overflow: auto; border: 1px solid var(--c-rule); } .frm .kr, .kr { display: flex; flex-direction: row; gap: 10px; align-items: flex-start; padding: 8px 10px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .kr small { display: block; color: var(--c-muted); font-size: 12px; } .ok { color: var(--c-ink-soft); font-size: 13.5px; margin: 0; }
.dc .ex { font-style: normal; font-size: 11px; color: var(--c-blue-deep); }
</style>
