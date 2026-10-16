<script setup lang="ts">
// A fundraising pipeline: stages with totals on the left; investors with stage, amount and primary contact.
const id = useRoute().params.id as string
interface St { id: string; name: string; color: string; kind: string; sort: number; total: number; n: number }
interface Dl { added_by_team?: boolean; on_captable?: boolean; id: string; investor: string; stage_id: string; amount: number | null; notes: string | null; contact_id: string | null; contact_name: string | null; contact_email: string | null; next_meeting: string | null }
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
// Add a whole contact list (e.g. "Investors") to this pipeline, in its first stage.
const fc = reactive({ open: false, list: '', busy: false, msg: '' })
const { data: cl, execute: loadLists } = await useLazyFetch<{ lists: { id: string; name: string; n: number }[]; all: number }>('/api/crm/contacts', { query: { size: 25 }, server: false, immediate: false })
function openFromContacts() { fc.open = true; fc.msg = ''; fc.list = ''; void loadLists() }
async function addFromContacts() {
  fc.busy = true; fc.msg = ''
  try { const r = await $fetch<{ added: number; skipped: number }>('/api/crm/deals/from-contacts', { method: 'POST', body: { pipeline_id: id, match: { q: '', list: fc.list } } }); fc.open = false; msg.value = ''; await refresh(); okMsg.value = r.added + ' investor' + (r.added === 1 ? '' : 's') + ' added' + (r.skipped ? ' (' + r.skipped + ' already in this pipeline)' : '') + '.' }
  catch (e) { fc.msg = err(e) } finally { fc.busy = false }
}
const okMsg = ref('')
// Closed investors onto the cap table: SAFE or note pipelines add SAFEs or notes; a priced round issues shares.
interface Cap { captables: { id: string; name: string; is_main: boolean }[]; classes: { id: string; name: string; issue_price: number | null }[]; captable: string }
const cap = reactive({ open: false, ids: [] as string[], ct: '', class_id: '', price: '' as string | number, issued_on: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), busy: false, msg: '', info: null as Cap | null })
const capDeals = computed(() => (data.value?.deals ?? []).filter((d) => cap.ids.includes(d.id)))
const capReady = computed(() => capDeals.value.filter((d) => st(d.stage_id)?.kind === 'won' && !d.on_captable && d.amount))
async function loadCap() { try { cap.info = await $fetch<Cap>('/api/equity', { query: cap.ct ? { ct: cap.ct } : {} }); cap.ct = cap.info.captable; if (!cap.info.classes.some((c) => c.id === cap.class_id)) { const pref = cap.info.classes.find((c) => /pref|seed|series/i.test(c.name)) ?? cap.info.classes[0]; cap.class_id = pref?.id ?? ''; if (pref?.issue_price) cap.price = pref.issue_price } } catch (e) { cap.msg = err(e) } }
function openCap(ids: string[]) { Object.assign(cap, { open: true, ids: [...ids], msg: '', ct: '', info: null }); void loadCap() }
async function addToCap() {
  cap.busy = true; cap.msg = ''
  try {
    const r = await $fetch<{ added: number; skipped: { investor: string; reason: string }[] }>('/api/crm/deals/to-captable', { method: 'POST', body: { ids: cap.ids, captable_id: cap.ct || undefined, issued_on: cap.issued_on, class_id: data.value?.pipeline.instrument === 'priced' ? cap.class_id : undefined, price: data.value?.pipeline.instrument === 'priced' ? cap.price : undefined } })
    cap.open = false; sel.value = []; await refresh()
    okMsg.value = r.added + ' investor' + (r.added === 1 ? '' : 's') + ' added to the cap table' + (r.skipped.length ? '; skipped ' + r.skipped.map((x) => x.investor + ' (' + x.reason + ')').join(', ') : '') + '.'
  } catch (e) { cap.msg = err(e) } finally { cap.busy = false }
}
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
        <div class="row"><input v-model="q" placeholder="Search investors" aria-label="Search"><button class="btn secondary" @click="calOpen = true">Calendar</button><button class="btn secondary" @click="openFromContacts">Add from contacts</button><button class="btn" @click="openDeal()">New investor</button></div></div>
      <p v-if="okMsg" class="okm">{{ okMsg }}</p>
      <p v-if="msg" class="error">{{ msg }}</p>
      <div v-if="sel.length" class="bulk"><b>{{ sel.length }} selected</b><select v-model="bulkTo"><option value="">Move to stage…</option><option v-for="s in data.stages" :key="s.id" :value="s.id">{{ s.name }}</option></select><button class="btn secondary sm" type="button" @click="openCap(sel)">Add to cap table</button></div>
      <div class="box"><table v-if="list.length"><thead><tr><th class="ck" /><th>Investor</th><th>Stage</th><th class="n">Amount</th><th>Primary contact</th><th>Next meeting</th></tr></thead>
        <tbody><tr v-for="d in list" :key="d.id" @click="openDeal(d)"><td class="ck" @click.stop><input v-model="sel" type="checkbox" :value="d.id" aria-label="Select"></td><td><b>{{ d.investor }}</b><span v-if="d.on_captable" class="oc">On cap table</span><span v-if="d.added_by_team" class="vf" title="Introduced by the Finvry fundraising team, who keep the contact details">Via Finvry</span></td>
          <td @click.stop><select class="stsel" :class="st(d.stage_id)?.color" :value="d.stage_id" @change="move(($event.target as HTMLSelectElement).value, [d.id])"><option v-for="s in data.stages" :key="s.id" :value="s.id">{{ s.name }}</option></select></td>
          <td class="n">{{ d.amount != null ? money(d.amount) : '—' }}<button v-if="st(d.stage_id)?.kind === 'won' && !d.on_captable && d.amount" class="lk ac" type="button" @click.stop="openCap([d.id])">Add to cap table</button></td>
          <td><NuxtLink v-if="d.contact_id" :to="'/contacts/' + d.contact_id" class="ct" @click.stop><span class="av">{{ initials(d.contact_name ?? d.contact_email ?? '?') }}</span><span><b>{{ d.contact_name }}</b><em>{{ d.contact_email }}</em></span></NuxtLink><span v-else class="mut">{{ d.added_by_team ? 'Kept by Finvry' : '—' }}</span></td><td><span v-if="d.next_meeting" class="nm">{{ new Date(d.next_meeting).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</span><span v-else class="mut">—</span></td></tr></tbody></table>
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
    <AppModal :open="fc.open" title="Add investors from contacts" @close="fc.open = false">
      <div class="fcf"><p class="mut">Each contact is added as an investor in the first stage, under their firm (or their name). Contacts already in this pipeline are skipped.</p>
        <label class="label">Which contacts<select v-model="fc.list"><option value="">All contacts ({{ cl?.all ?? '…' }})</option><option v-for="l in cl?.lists ?? []" :key="l.id" :value="l.id">{{ l.name }} ({{ l.n }})</option></select></label>
        <p v-if="fc.msg" class="error">{{ fc.msg }}</p></div>
      <template #foot><button class="btn secondary" @click="fc.open = false">Cancel</button><button class="btn" :disabled="fc.busy" @click="addFromContacts">{{ fc.busy ? 'Adding…' : 'Add to ' + data.pipeline.name }}</button></template>
    </AppModal>
    <AppModal :open="cap.open" title="Add to cap table" @close="cap.open = false">
      <div class="fcf">
        <p class="mut">{{ data.pipeline.instrument === 'priced' ? 'Each closed investor gets shares at the price per share: amount ÷ price, rounded down.' : 'Each closed investor is added as a ' + (data.pipeline.instrument === 'convertible_note' ? 'convertible note' : 'SAFE') + ' for their amount' + (data.pipeline.valuation_cap ? ', ' + money(data.pipeline.valuation_cap) + ' post-money cap' : '') + (data.pipeline.discount ? ', ' + data.pipeline.discount + '% discount' : '') + '.' }} Only investors in a "Won" stage with an amount are added.</p>
        <label v-if="(cap.info?.captables.length ?? 0) > 1" class="label">Cap table<select v-model="cap.ct" @change="loadCap"><option v-for="c in cap.info!.captables" :key="c.id" :value="c.id">{{ c.name }}{{ c.is_main ? ' (main)' : '' }}</option></select></label>
        <template v-if="data.pipeline.instrument === 'priced'">
          <label class="label">Share class<select v-model="cap.class_id"><option v-if="!cap.info?.classes.length" value="">Add a share class on the cap table first</option><option v-for="c in cap.info?.classes ?? []" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
          <label class="label">Price per share ({{ data.pipeline.currency }})<input v-model="cap.price" inputmode="decimal"></label>
        </template>
        <label class="label">Date issued<input v-model="cap.issued_on" type="date"></label>
        <ul class="capl"><li v-for="d in capDeals" :key="d.id" :class="{ off: !capReady.includes(d) }"><span>{{ d.investor }}</span><span>{{ money(d.amount) }}{{ d.on_captable ? ' · already added' : st(d.stage_id)?.kind !== 'won' ? ' · not closed' : !d.amount ? ' · no amount' : '' }}</span></li></ul>
        <p v-if="cap.msg" class="error">{{ cap.msg }}</p></div>
      <template #foot><NuxtLink :to="'/cap-table' + (cap.ct ? '?ct=' + cap.ct : '')" class="btn secondary">Open cap table</NuxtLink><span class="sp" /><button class="btn secondary" @click="cap.open = false">Cancel</button><button class="btn" :disabled="cap.busy || !capReady.length" @click="addToCap">{{ cap.busy ? 'Adding…' : 'Add ' + capReady.length + ' investor' + (capReady.length === 1 ? '' : 's') }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.oc { margin-left: 8px; font-size: 11.5px; padding: 2px 7px; background: var(--c-paper-2); color: var(--c-ink-soft); } .ac { display: block; margin-left: auto; font-size: 12.5px; margin-top: 2px; } .capl { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--c-rule); max-height: 220px; overflow: auto } .capl li { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px } .capl li.off { color: var(--c-muted) }
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
.vf { margin-left: 8px; font-size: 11px; font-weight: 600; padding: 2px 7px; background: var(--c-signal-soft); color: var(--c-blue-deep); white-space: nowrap; }
.okm { margin: 0 0 8px; font-size: 13.5px; color: var(--c-ink); } .fcf { display: flex; flex-direction: column; gap: 12px; } .fcf label { display: flex; flex-direction: column; gap: 6px; } .fcf select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
</style>
