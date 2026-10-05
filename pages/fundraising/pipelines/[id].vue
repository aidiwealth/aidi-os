<script setup lang="ts">
// A fundraising pipeline: stages with totals on the left; investors with stage, amount and primary contact.
const id = useRoute().params.id as string
interface St { id: string; name: string; color: string; kind: string; sort: number; total: number; n: number }
interface Dl { id: string; investor: string; stage_id: string; amount: number | null; notes: string | null; contact_id: string | null; contact_name: string | null; contact_email: string | null; next_meeting: string | null }
const calOpen = ref(false)
const sugg = ref<string[]>([]); let sgT: ReturnType<typeof setTimeout> | undefined
function suggest() { clearTimeout(sgT); const q = dl.investor; sgT = setTimeout(async () => { if (q.trim().length < 2) { sugg.value = []; return } try { sugg.value = await $fetch<string[]>('/api/crm/investors/suggest', { query: { q } }) } catch { sugg.value = [] } }, 200) }
interface D { pipeline: { id: string; name: string; currency: string; target: number | null; instrument: string; valuation_cap: number | null; discount: number | null; pre_money: number | null; status: string; target_close: string | null }; stages: St[]; deals: Dl[]; contacts: { id: string; name: string; email: string; firm: string | null }[] }
const { data, refresh } = await useFetch<D>('/api/crm/pipelines/' + id)
useHead({ title: () => data.value?.pipeline.name ?? 'Pipeline' })
const SYM: Record<string, string> = { USD: '$', NGN: '₦' }
const money = (v: number | null | undefined) => (v == null ? '—' : (SYM[data.value?.pipeline.currency ?? 'USD'] ?? '') + Math.round(v).toLocaleString('en-US'))
const short = (v: number) => (SYM[data.value?.pipeline.currency ?? 'USD'] ?? '') + (v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : String(v))
const stage = ref(''); const q = ref(''); const sel = ref<string[]>([])
const st = (sid: string) => data.value?.stages.find((s) => s.id === sid)
const list = computed(() => (data.value?.deals ?? []).filter((d) => (!stage.value || d.stage_id === stage.value) && (!q.value || (d.investor + ' ' + (d.contact_name ?? '') + ' ' + (d.contact_email ?? '')).toLowerCase().includes(q.value.toLowerCase()))))
const progStage = ref('')
const prog = computed(() => { const s = data.value?.stages ?? []; const from = s.find((x) => x.id === progStage.value); const t = s.filter((x) => x.kind !== 'lost' && (!from || x.sort >= from.sort)).reduce((a, x) => a + x.total, 0); const tg = data.value?.pipeline.target ?? 0; return { total: t, pct: tg ? Math.min(100, (t / tg) * 100) : 0 } })
const committedTotal = computed(() => (data.value?.stages ?? []).filter((s) => s.kind === 'committed' || s.kind === 'won').reduce((a, s) => a + s.total, 0))
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const msg = ref(''); const busy = ref(false)
const initials = (s: string) => s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
const dl = reactive({ open: false, id: '', investor: '', stage_id: '', contact_id: '' as string, contact_name: '', contact_email: '', amount: '' as string | number, notes: '' })
function openDeal(d?: Dl) { Object.assign(dl, d ? { open: true, id: d.id, investor: d.investor, stage_id: d.stage_id, contact_id: d.contact_id ?? '', contact_name: '', contact_email: '', amount: d.amount ?? '', notes: d.notes ?? '' } : { open: true, id: '', investor: '', stage_id: stage.value || data.value?.stages[0]?.id || '', contact_id: '', contact_name: '', contact_email: '', amount: '', notes: '' }); msg.value = '' }
async function saveDeal() { busy.value = true; msg.value = ''; try { await $fetch('/api/crm/deals', { method: 'POST', body: { ...dl, pipeline_id: id, id: dl.id || undefined, contact_id: dl.contact_id && dl.contact_id !== '__new' ? dl.contact_id : null } }); dl.open = false; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function move(stage_id: string, ids = sel.value) { if (!stage_id || !ids.length) return; try { await $fetch('/api/crm/deals/move', { method: 'POST', body: { ids, stage_id } }); sel.value = []; await refresh() } catch (e) { msg.value = err(e) } }
const bulkTo = ref(''); watch(bulkTo, (v) => { if (v) { move(v); nextTick(() => (bulkTo.value = '')) } })
const pe = reactive({ open: false, name: '', target: '' as string | number, currency: 'USD', instrument: 'safe', valuation_cap: '' as string | number, discount: '' as string | number, pre_money: '' as string | number, status: 'open', target_close: '' })
function editPipeline() { const p = data.value?.pipeline; if (p) Object.assign(pe, { open: true, name: p.name, target: p.target ?? '', currency: p.currency, instrument: p.instrument, valuation_cap: p.valuation_cap ?? '', discount: p.discount ?? '', pre_money: p.pre_money ?? '', status: p.status, target_close: p.target_close ?? '' }) }
async function savePipeline() { try { await $fetch('/api/crm/pipelines', { method: 'POST', body: { id, ...pe } }); pe.open = false; await refresh() } catch (e) { msg.value = err(e) } }
const se = reactive({ open: false, stages: [] as { id?: string; name: string; color: string; kind: string }[] })
function editStages() { se.stages = (data.value?.stages ?? []).map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind })); se.open = true }
function up(i: number) { if (i > 0) { const a = se.stages; [a[i - 1], a[i]] = [a[i]!, a[i - 1]!] } }
async function saveStages() { msg.value = ''; try { await $fetch('/api/crm/stages', { method: 'POST', body: { pipeline_id: id, stages: se.stages } }); se.open = false; await refresh() } catch (e) { msg.value = err(e) } }
const COLORS = ['grey', 'blue', 'purple', 'teal', 'amber', 'green', 'red']
const contactLabel = (c: { name: string; email: string; firm: string | null }) => c.name + ' · ' + c.email + (c.firm ? ' (' + c.firm + ')' : '')
</script>
<template>
  <section v-if="data" class="pl">
    <aside class="side"><NuxtLink to="/fundraising?t=round" class="back">← Pipelines</NuxtLink><h1>{{ data.pipeline.name }}</h1><span class="tg">{{ money(data.pipeline.target) }} target · <button class="lk" @click="editPipeline">Edit</button> · <DeleteButton type="crm_pipeline" :id="id" :name="'the pipeline ' + data.pipeline.name + ' and its investors'" link @deleted="navigateTo('/fundraising?t=round')" /></span>
      <button class="sr" :class="{ on: !stage }" @click="stage = ''"><span>All stages</span><em>{{ data.deals.length }}</em></button>
      <button v-for="s in data.stages" :key="s.id" class="sr" :class="{ on: stage === s.id }" @click="stage = s.id"><span><i class="dot" :class="s.color" />{{ s.name }}</span><em>{{ short(s.total) }} ({{ s.n }})</em></button>
      <button class="lk ed" @click="editStages">Edit stages</button></aside>
    <div class="main">
      <div class="top"><div class="pg"><select v-model="progStage" aria-label="Progress from stage"><option value="">All stages</option><option v-for="s in data.stages.filter((x) => x.kind !== 'lost')" :key="s.id" :value="s.id">{{ s.name }} and later</option></select><span>{{ money(prog.total) }} ({{ prog.pct.toFixed(1) }}%)</span><div class="pb"><i :style="{ width: prog.pct + '%' }" /></div><span class="mut">{{ money(committedTotal) }} committed</span></div>
        <div class="row"><input v-model="q" placeholder="Search investors" aria-label="Search"><button class="btn secondary" @click="calOpen = true">Calendar</button><button class="btn" @click="openDeal()">New investor</button></div></div>
      <p v-if="msg" class="error">{{ msg }}</p>
      <div v-if="sel.length" class="bulk"><b>{{ sel.length }} selected</b><select v-model="bulkTo"><option value="">Move to stage…</option><option v-for="s in data.stages" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
      <div class="box"><table v-if="list.length"><thead><tr><th class="ck" /><th>Investor</th><th>Stage</th><th class="n">Amount</th><th>Primary contact</th><th>Next meeting</th></tr></thead>
        <tbody><tr v-for="d in list" :key="d.id" @click="openDeal(d)"><td class="ck" @click.stop><input v-model="sel" type="checkbox" :value="d.id" aria-label="Select"></td><td><b>{{ d.investor }}</b></td>
          <td @click.stop><select class="stsel" :class="st(d.stage_id)?.color" :value="d.stage_id" @change="move(($event.target as HTMLSelectElement).value, [d.id])"><option v-for="s in data.stages" :key="s.id" :value="s.id">{{ s.name }}</option></select></td>
          <td class="n">{{ d.amount != null ? money(d.amount) : '—' }}</td>
          <td><NuxtLink v-if="d.contact_id" :to="'/contacts/' + d.contact_id" class="ct" @click.stop><span class="av">{{ initials(d.contact_name ?? d.contact_email ?? '?') }}</span><span><b>{{ d.contact_name }}</b><em>{{ d.contact_email }}</em></span></NuxtLink><span v-else class="mut">—</span></td><td><span v-if="d.next_meeting" class="nm">{{ new Date(d.next_meeting).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</span><span v-else class="mut">—</span></td></tr></tbody></table>
        <EmptyState v-else icon="pipeline" :title="data.deals.length ? 'No investors in this stage' : 'No investors yet'" :text="data.deals.length ? 'Pick another stage on the left.' : 'Add the funds and angels you are talking to, with their primary contact.'"><button v-if="!data.deals.length" class="btn" @click="openDeal()">Add an investor</button></EmptyState></div>
    </div>
    <AppModal :open="dl.open" :title="dl.id ? dl.investor : 'New investor'" @close="dl.open = false">
      <form id="dlf" class="frm g2" @submit.prevent="saveDeal"><label class="label w">Investor (fund or angel)<input v-model="dl.investor" required maxlength="200" list="inv-sugg" autocomplete="off" placeholder="Start typing, e.g. Partech" @input="suggest"><datalist id="inv-sugg"><option v-for="s in sugg" :key="s" :value="s" /></datalist></label>
        <label class="label">Stage<select v-model="dl.stage_id" required><option v-for="s in data.stages" :key="s.id" :value="s.id">{{ s.name }}</option></select></label><label class="label">Amount ({{ data.pipeline.currency }})<input v-model="dl.amount" inputmode="decimal"></label>
        <label class="label w">Primary contact<select v-model="dl.contact_id"><option value="">None</option><option value="__new">+ New contact</option><option v-for="c in data.contacts" :key="c.id" :value="c.id">{{ contactLabel(c) }}</option></select></label>
        <template v-if="dl.contact_id === '__new'"><label class="label">Contact name<input v-model="dl.contact_name" maxlength="200"></label><label class="label">Contact email<input v-model="dl.contact_email" type="email" maxlength="254"></label></template>
        <label class="label w">Notes<textarea v-model="dl.notes" rows="3" maxlength="3000" /></label>
        <div v-if="dl.id" class="w"><MeetingPanel :key="dl.id" :deal-id="dl.id" :investor="dl.investor" @changed="refresh()" /></div><p v-if="msg" class="error w">{{ msg }}</p></form>
      <template #foot><DeleteButton v-if="dl.id" type="crm_deal" :id="dl.id" :name="dl.investor" link @deleted="dl.open = false; refresh()" /><span class="sp" /><button class="btn secondary" @click="dl.open = false">Cancel</button><button class="btn" type="submit" form="dlf" :disabled="busy">Save</button></template>
    </AppModal>
    <AppModal :open="calOpen" title="Calendar" wide @close="calOpen = false"><CalendarSync :pipeline-id="id" @changed="refresh()" /></AppModal>
    <AppModal :open="pe.open" title="Edit pipeline" @close="pe.open = false">
      <form id="pef" class="frm g2" @submit.prevent="savePipeline"><label class="label w">Name<input v-model="pe.name" required maxlength="120"></label><label class="label">Target<input v-model="pe.target" inputmode="decimal"></label><label class="label">Currency<select v-model="pe.currency"><option value="USD">US dollar</option><option value="NGN">Naira</option></select></label>
        <label class="label">Instrument<select v-model="pe.instrument"><option value="safe">SAFE</option><option value="priced">Priced round</option><option value="convertible_note">Convertible note</option></select></label><label v-if="pe.instrument !== 'priced'" class="label">Post-money cap<input v-model="pe.valuation_cap" inputmode="decimal"></label><label v-else class="label">Pre-money valuation<input v-model="pe.pre_money" inputmode="decimal"></label>
        <label class="label">Target close<input v-model="pe.target_close" type="date"></label><label class="label">Status<select v-model="pe.status"><option value="open">Open</option><option value="closed">Closed</option></select></label></form>
      <template #foot><DeleteButton type="crm_pipeline" :id="id" :name="data.pipeline.name" link @deleted="navigateTo('/fundraising?t=round')" /><span class="sp" /><button class="btn secondary" @click="pe.open = false">Cancel</button><button class="btn" type="submit" form="pef">Save</button></template>
    </AppModal>
    <AppModal :open="se.open" title="Edit stages" @close="se.open = false">
      <div class="frm"><p class="mut">"Committed" and "Won" stages count toward money committed; "Won" is money in. "Lost" stages are left out of totals.</p>
        <div v-for="(s, i) in se.stages" :key="i" class="stg"><button type="button" class="mv" :disabled="!i" aria-label="Move up" @click="up(i)">↑</button><input v-model="s.name" maxlength="60" required><select v-model="s.color"><option v-for="c in COLORS" :key="c" :value="c">{{ c }}</option></select><select v-model="s.kind"><option value="open">In progress</option><option value="committed">Committed</option><option value="won">Won</option><option value="lost">Lost</option></select><button type="button" class="x" aria-label="Remove" @click="se.stages.splice(i, 1)">×</button></div>
        <button type="button" class="btn secondary sm" @click="se.stages.push({ name: 'New stage', color: 'blue', kind: 'open' })">+ Add stage</button><p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button class="btn secondary" @click="se.open = false">Cancel</button><button class="btn" @click="saveStages">Save stages</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.pl { display: grid; grid-template-columns: 280px 1fr; gap: 18px; align-items: start; } .side { background: var(--c-paper-2); padding: 16px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 12px; }
.back { color: var(--c-muted); font-size: 13px; } .side h1 { font-size: 24px; margin: 6px 0 2px; } .tg { font-size: 14px; color: var(--c-ink-soft); margin-bottom: 10px; } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .ed { margin-top: 10px; align-self: flex-start; font-size: 13px; }
.sr { display: flex; justify-content: space-between; gap: 8px; background: none; border: 0; padding: 9px 10px; font: inherit; font-size: 14px; cursor: pointer; text-align: left; } .sr.on { background: #e6e4dd; } .sr em { font-style: normal; color: var(--c-ink-soft); white-space: nowrap; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 8px; vertical-align: middle; } .dot.grey { background: #999; } .dot.blue { background: #3d74c9; } .dot.purple { background: #7b5fd8; } .dot.teal { background: #1f9a8a; } .dot.amber { background: #d99a1e; } .dot.green { background: #2f9a5f; } .dot.red { background: #d04444; }
.main { min-width: 0; } .top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; } .pg { display: grid; grid-template-columns: auto auto; gap: 4px 14px; align-items: center; min-width: 360px; } .pg select { border: 0; background: none; color: var(--c-muted); padding: 0; } .pg > span:nth-child(2) { text-align: right; color: var(--c-ink-soft); font-size: 13px; }
.pb { grid-column: 1 / -1; height: 10px; background: #e2e1dc; } .pb i { display: block; height: 100%; background: var(--c-navy); } .row { display: flex; gap: 8px; } .row input { min-width: 220px; }
.bulk { display: flex; gap: 10px; align-items: center; background: var(--c-signal-soft); padding: 8px 12px; margin-bottom: 8px; } .box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); } td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); font-size: 14px; } tbody tr { cursor: pointer; } tbody tr:hover { background: #fafaf8; } .n { text-align: right; } th.n { text-align: right; } .ck { width: 34px; }
.stsel { border: 0; font: inherit; font-size: 12.5px; padding: 3px 8px; cursor: pointer; } .stsel.grey { background: #eee; } .stsel.blue { background: #e3edfb; color: #1c4f9c; } .stsel.purple { background: #eee8fb; color: #5b3fb5; } .stsel.teal { background: #def3f0; color: #146b5f; } .stsel.amber { background: #fbf0dc; color: #8a5a0a; } .stsel.green { background: #e0f2e7; color: #1f7a4d; } .stsel.red { background: #fbe3e3; color: #a12a2a; }
.ct { display: flex; gap: 10px; align-items: center; text-decoration: none; color: var(--c-ink); } .ct span:last-child { display: flex; flex-direction: column; font-size: 13.5px; } .ct em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .av { width: 30px; height: 30px; border-radius: 50%; background: #ece9fb; color: #4b3fb5; display: grid; place-items: center; font-size: 11px; font-weight: 600; flex: none; }
.none { padding: 32px; text-align: center; } .none p { color: var(--c-ink-soft); margin: 6px 0 14px; } .frm { display: flex; flex-direction: column; gap: 12px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .w { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 6px; }
input, select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .stg { display: flex; gap: 6px; } .stg input { flex: 1; } .mv, .x { background: none; border: 1px solid var(--c-rule); width: 30px; cursor: pointer; } .x { border: 0; font-size: 20px; color: var(--c-muted); }
.sp { flex: 1; } .btn.sm { padding: 5px 10px; font-size: 12.5px; align-self: flex-start; } .mut { color: var(--c-muted); font-size: 13px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 1000px) { .pl { grid-template-columns: 1fr; } .side { position: static; } }
.nm { font-size: 12.5px; background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 2px 8px; white-space: nowrap; }
</style>
