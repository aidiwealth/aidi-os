<script setup lang="ts">
// An LP pipeline: a fund raise (tied to a fund), a debt facility, or a co-investment / SPV (tied to a deal's round
// and the portfolio company). Stages with totals; each LP with stage, amount, how likely they are to commit and the
// next step; LPs who sign go onto the LP register (and, for a fund, as a commitment).
const id = useRoute().params.id as string
interface St { id: string; name: string; kind: string; sort: number; n: number; total: number }
interface T { id: string; stage_id: string; amount: number | null; likelihood: number | null; likelihood_note: string | null; next_step: string | null; next_date: string | null; notes: string | null; lp_id: string | null; commitment_id: string | null; updated: string
  prospect_id: string; name: string; kind: string; capital: string; country: string | null; contact_name: string | null; contact_title: string | null; email: string | null; linkedin: string | null; website: string | null; ticket_min_usd: number | null; ticket_max_usd: number | null; mandate: string | null; backs_emerging: boolean | null }
interface D { pipeline: { id: string; name: string; kind: string; currency: string; target: number | null; target_close: string | null; status: string; notes: string | null; mandate: Record<string, unknown>; interest_pct: number | null; tenor_months: number | null; fund_id: string | null; fund: string | null; fund_size: number | null; deal_id: string | null; deal: string | null; deal_round: string | null; company_id: string | null; company: string | null }; stages: St[]; targets: T[] }
const { data, refresh } = await useFetch<D>('/api/funds/pipelines/' + id)
useHead({ title: () => data.value?.pipeline.name ?? 'LP pipeline' })
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const isGp = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const KIND: Record<string, string> = { family_office: 'Family office', fund_of_funds: 'Fund of funds', endowment: 'Endowment', foundation: 'Foundation', pension: 'Pension fund', sovereign: 'Sovereign wealth fund', insurance: 'Insurer', corporate: 'Corporate', bank: 'Bank', dfi: 'DFI', private_credit: 'Private credit', asset_manager: 'Asset manager', hnwi: 'HNWI', angel: 'Angel', other: 'Other' }
const PK: Record<string, string> = { fund: 'Fund raise', debt: 'Debt facility', co_invest: 'Co-investment / SPV' }
const cur = computed(() => data.value?.pipeline.currency ?? 'USD')
const money = (v: number | null | undefined) => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.value, maximumFractionDigits: 0 }).format(v))
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const short = (v: number) => (SYM[cur.value] ?? cur.value + ' ') + (v >= 1e9 ? (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : String(Math.round(v)))
const st = (sid: string) => data.value?.stages.find((s) => s.id === sid)
const stage = ref(''), q = ref(''), sel = ref<string[]>([]), sortBy = ref<'recent' | 'likely' | 'amount'>('recent'), okMsg = ref(''), msg = ref('')
const list = computed(() => { const l = (data.value?.targets ?? []).filter((x) => (!stage.value || x.stage_id === stage.value) && (!q.value || (x.name + ' ' + (x.contact_name ?? '') + ' ' + (x.country ?? '')).toLowerCase().includes(q.value.toLowerCase()))); return sortBy.value === 'likely' ? l.slice().sort((a, b) => (b.likelihood ?? -1) - (a.likelihood ?? -1)) : sortBy.value === 'amount' ? l.slice().sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)) : l })
const sum = (k: string[]) => (data.value?.stages ?? []).filter((s) => k.includes(s.kind)).reduce((a, s) => a + s.total, 0)
const committed = computed(() => sum(['committed', 'won'])), closed = computed(() => sum(['won'])), inPlay = computed(() => sum(['open', 'committed', 'won']))
const weighted = computed(() => (data.value?.targets ?? []).filter((x) => st(x.stage_id)?.kind !== 'lost').reduce((a, x) => a + (x.amount ?? 0) * (st(x.stage_id)?.kind === 'won' || st(x.stage_id)?.kind === 'committed' ? 1 : (x.likelihood ?? 0) / 100), 0))
const target = computed(() => data.value?.pipeline.target ?? data.value?.pipeline.fund_size ?? 0)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function act(body: Record<string, unknown>) { msg.value = ''; try { await $fetch('/api/funds/pipelines/' + id + '/targets', { method: 'POST', body }); await refresh() } catch (e) { msg.value = err(e) } }
const bulkTo = ref(''); watch(bulkTo, async (v) => { if (v && sel.value.length) { await act({ move: { ids: sel.value, stage_id: v } }); sel.value = [] } nextTick(() => (bulkTo.value = '')) })
// One LP in the pipeline.
const ed = reactive({ open: false, t: null as T | null, stage_id: '', amount: '' as string | number, likelihood: '' as string | number, next_step: '', next_date: '', notes: '', busy: false })
function open(t: T) { Object.assign(ed, { open: true, t, stage_id: t.stage_id, amount: t.amount ?? '', likelihood: t.likelihood ?? '', next_step: t.next_step ?? '', next_date: t.next_date ?? '', notes: t.notes ?? '' }) }
async function saveEd() { ed.busy = true; await act({ edit: { id: ed.t!.id, stage_id: ed.stage_id, amount: ed.amount === '' ? null : Number(ed.amount), likelihood: ed.likelihood === '' ? null : Number(ed.likelihood), next_step: ed.next_step, next_date: ed.next_date, notes: ed.notes } }); ed.busy = false; if (!msg.value) ed.open = false }
async function removeOne() { if (!confirm('Take ' + ed.t!.name + ' out of this pipeline? They stay on the LP list.')) return; await act({ remove: [ed.t!.id] }); ed.open = false }
// Add LPs: from the list, an import, or an AI search.
const add = reactive({ open: false, mode: 'import' as 'import' | 'find' })
const pick = reactive({ open: false, q: '', ids: [] as string[] })
const { data: pros, execute: loadPros } = useLazyFetch<{ items: { id: string; name: string; kind: string; country: string | null; pipelines: { pipeline_id: string }[] }[] }>('/api/funds/prospects', { server: false, immediate: false })
const pickable = computed(() => (pros.value?.items ?? []).filter((p) => !p.pipelines.some((x) => x.pipeline_id === id) && (!pick.q || p.name.toLowerCase().includes(pick.q.toLowerCase()))))
async function addPicked() { await act({ add: pick.ids }); okMsg.value = pick.ids.length + ' added.'; pick.open = false; pick.ids = [] }
function done(m: string) { add.open = false; okMsg.value = m; sortBy.value = 'likely'; void refresh() }
// Signed: onto the LP register (and a commitment to the fund).
const canReg = (t: T) => ['won', 'committed'].includes(st(t.stage_id)?.kind ?? '') && !t.lp_id
async function register(ids: string[]) {
  msg.value = ''
  try { const r = await $fetch<{ added: number; skipped: { name: string; reason: string }[] }>('/api/funds/pipelines/' + id + '/register', { method: 'POST', body: { ids } }); okMsg.value = r.added + ' added to the LP register' + (data.value?.pipeline.kind === 'fund' ? ' with their commitment to ' + data.value.pipeline.fund : '') + (r.skipped.length ? '; skipped ' + r.skipped.map((x) => x.name + ' (' + x.reason + ')').join(', ') : '') + '.'; sel.value = []; await refresh() }
  catch (e) { msg.value = err(e) }
}
const pf = ref(false)
async function removeSel() { if (!confirm('Take ' + sel.value.length + ' out of this pipeline? They stay on the LP list.')) return; await act({ remove: sel.value }); sel.value = [] }
async function delPipeline() { if (!confirm('Delete the pipeline "' + data.value?.pipeline.name + '"? The LPs stay on the list and the register.')) return; await $fetch('/api/funds/pipelines/' + id, { method: 'DELETE' }); navigateTo('/funds') }
const lk = (v: number | null) => (v == null ? '' : v >= 70 ? 'hi' : v >= 45 ? 'md' : 'lo')
const due = (d: string | null) => !!d && d <= new Date().toISOString().slice(0, 10)
const COL: Record<string, string> = { open: '#7d8aa5', committed: '#b07a12', won: '#1f3a6b', lost: '#b0b0b0' }
</script>
<template>
  <section v-if="data" class="lpp">
    <aside class="side"><NuxtLink to="/funds" class="back">← Funds &amp; LPs</NuxtLink><h1>{{ data.pipeline.name }}</h1>
      <span class="ty">{{ PK[data.pipeline.kind] }}{{ data.pipeline.status === 'closed' ? ' · Closed' : '' }}</span>
      <div class="tie"><NuxtLink v-if="data.pipeline.fund_id" :to="'/funds/' + data.pipeline.fund_id">{{ data.pipeline.fund }}</NuxtLink><NuxtLink v-if="data.pipeline.deal_id" :to="'/pipeline/' + data.pipeline.deal_id">Deal: {{ data.pipeline.deal }}{{ data.pipeline.deal_round ? ' · ' + data.pipeline.deal_round : '' }}</NuxtLink><NuxtLink v-if="data.pipeline.company_id" :to="'/portfolio/' + data.pipeline.company_id">Portfolio: {{ data.pipeline.company }}</NuxtLink>
        <span v-if="data.pipeline.kind === 'debt' && (data.pipeline.interest_pct || data.pipeline.tenor_months)">{{ [data.pipeline.interest_pct ? data.pipeline.interest_pct + '% a year' : '', data.pipeline.tenor_months ? data.pipeline.tenor_months + ' months' : ''].filter(Boolean).join(', ') }}</span></div>
      <button class="sr" :class="{ on: !stage }" @click="stage = ''"><span>All stages</span><em>{{ data.targets.length }}</em></button>
      <button v-for="s in data.stages" :key="s.id" class="sr" :class="{ on: stage === s.id }" @click="stage = s.id"><span><i class="dot" :style="{ background: COL[s.kind] }" />{{ s.name }}</span><em>{{ s.total ? short(s.total) + ' · ' : '' }}{{ s.n }}</em></button>
      <span v-if="isGp" class="acts"><button class="lk" @click="pf = true">Edit</button> · <button class="lk red" @click="delPipeline">Delete</button></span></aside>
    <div class="main">
      <div class="stats"><div><em>{{ data.pipeline.kind === 'debt' ? 'Approved / disbursed' : 'Committed' }}</em><b>{{ money(committed) }}</b><span v-if="target">{{ Math.round(committed / target * 100) }}% of {{ short(target) }}</span></div><div><em>{{ data.pipeline.kind === 'debt' ? 'Disbursed' : 'Closed (signed)' }}</em><b>{{ money(closed) }}</b></div><div><em>In play</em><b>{{ money(inPlay) }}</b><span>{{ data.targets.filter((x) => st(x.stage_id)?.kind !== 'lost').length }} LPs</span></div><div><em>Weighted by likelihood</em><b>{{ money(weighted) }}</b></div></div>
      <div v-if="target" class="pb"><i class="c" :style="{ width: Math.min(100, committed / target * 100) + '%' }" /><i class="w" :style="{ width: Math.min(100, closed / target * 100) + '%' }" /></div>
      <div class="top"><input v-model="q" placeholder="Search LPs" aria-label="Search"><select v-model="sortBy" aria-label="Sort"><option value="recent">Recently updated</option><option value="likely">Most likely to commit</option><option value="amount">Largest amount</option></select>
        <span class="sp" /><template v-if="isGp"><button class="btn secondary" @click="pick.open = true; loadPros()">Add from LP list</button><button class="btn secondary" @click="add.mode = 'import'; add.open = true">Import list or Sheet</button><button class="btn" @click="add.mode = 'find'; add.open = true">Find LPs with AI</button></template></div>
      <p v-if="okMsg" class="ok">{{ okMsg }}</p><p v-if="msg" class="error">{{ msg }}</p>
      <div v-if="sel.length" class="bulk"><b>{{ sel.length }} selected</b><select v-model="bulkTo"><option value="">Move to stage…</option><option v-for="s in data.stages" :key="s.id" :value="s.id">{{ s.name }}</option></select><button class="btn secondary sm" @click="register(sel)">Add to LP register</button><button class="lk red" @click="removeSel">Remove</button></div>
      <div class="box"><table v-if="list.length" data-nosearch><thead><tr><th class="ck" /><th>LP</th><th>Stage</th><th class="n">Amount</th><th>Likely</th><th>Next step</th><th>Contact</th></tr></thead>
        <tbody><tr v-for="x in list" :key="x.id" @click="open(x)"><td class="ck" @click.stop><input v-model="sel" type="checkbox" :value="x.id" :aria-label="'Select ' + x.name"></td>
          <td><b>{{ x.name }}</b><span class="sub">{{ KIND[x.kind] ?? x.kind }}{{ x.country ? ' · ' + x.country : '' }}{{ x.capital !== 'equity' && data.pipeline.kind !== 'debt' ? ' · lends' : '' }}</span><span v-if="x.lp_id" class="tag">On LP register</span></td>
          <td @click.stop><select class="ss" :value="x.stage_id" :style="{ borderLeftColor: COL[st(x.stage_id)?.kind ?? 'open'] }" @change="act({ edit: { id: x.id, stage_id: ($event.target as HTMLSelectElement).value } })"><option v-for="s in data.stages" :key="s.id" :value="s.id">{{ s.name }}</option></select></td>
          <td class="n">{{ money(x.amount) }}<button v-if="isGp && canReg(x)" class="lk ac" @click.stop="register([x.id])">Add to LP register</button></td>
          <td><span v-if="x.likelihood != null" class="fit" :class="lk(x.likelihood)" :title="x.likelihood_note ?? ''">{{ x.likelihood }}%</span><span v-else class="sub">—</span></td>
          <td>{{ x.next_step || '—' }}<span v-if="x.next_date" class="sub" :class="{ due: due(x.next_date) }">{{ x.next_date }}</span></td>
          <td>{{ x.contact_name || '—' }}<span v-if="x.email" class="sub">{{ x.email }}</span></td></tr></tbody></table>
        <EmptyState v-else icon="users" :title="data.targets.length ? 'No LPs in this stage' : 'No LPs yet'" :text="data.targets.length ? 'Pick another stage.' : 'Add LPs from your list, import a tracker (Excel, CSV, Google Sheet), or let AI find LPs that fit this ' + (data.pipeline.kind === 'debt' ? 'facility' : data.pipeline.kind === 'co_invest' ? 'co-investment' : 'fund') + '.'" /></div>
    </div>
    <LpAdd :open="add.open" :mode="add.mode" :pipeline-id="id" :pipeline-name="data.pipeline.name" :mandate="{ fund: data.pipeline.fund ?? data.pipeline.name, size_usd: data.pipeline.fund_size ?? data.pipeline.target, capital: data.pipeline.kind === 'debt' ? 'debt' : 'equity', ...data.pipeline.mandate }" @close="add.open = false" @done="done" />
    <LpPipelineForm :open="pf" :edit="data.pipeline" @close="pf = false" @saved="pf = false; refresh()" />
    <AppModal :open="pick.open" title="Add from the LP list" @close="pick.open = false">
      <div class="pk"><input v-model="pick.q" placeholder="Search" aria-label="Search"><div class="pl"><label v-for="p in pickable" :key="p.id" class="ck2"><input v-model="pick.ids" type="checkbox" :value="p.id"> <span>{{ p.name }}<em>{{ KIND[p.kind] ?? p.kind }}{{ p.country ? ' · ' + p.country : '' }}</em></span></label><p v-if="pros && !pickable.length" class="sub">Everyone on the list is already here. <NuxtLink to="/funds/prospects">Open the LP list</NuxtLink></p></div></div>
      <template #foot><span class="sp" /><button class="btn secondary" @click="pick.open = false">Cancel</button><button class="btn" :disabled="!pick.ids.length" @click="addPicked">Add {{ pick.ids.length }}</button></template>
    </AppModal>
    <AppModal :open="ed.open" :title="ed.t?.name ?? ''" @close="ed.open = false">
      <div v-if="ed.t" class="tf">
        <p class="sub">{{ KIND[ed.t.kind] ?? ed.t.kind }}{{ ed.t.country ? ' · ' + ed.t.country : '' }}{{ ed.t.backs_emerging ? ' · backs emerging managers' : '' }}<a v-if="ed.t.website" :href="ed.t.website" target="_blank" rel="noopener"> · website</a></p>
        <p v-if="ed.t.mandate" class="md">{{ ed.t.mandate }}</p>
        <p v-if="ed.t.likelihood_note" class="sub">Fit: {{ ed.t.likelihood_note }}</p>
        <p v-if="ed.t.contact_name || ed.t.email" class="sub">Contact: {{ [ed.t.contact_name, ed.t.contact_title, ed.t.email].filter(Boolean).join(' · ') }}<a v-if="ed.t.linkedin" :href="ed.t.linkedin" target="_blank" rel="noopener"> · LinkedIn</a></p>
        <form id="tgf" class="g2" @submit.prevent="saveEd">
          <label class="label">Stage<select v-model="ed.stage_id"><option v-for="s in data.stages" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
          <label class="label">{{ data.pipeline.kind === 'debt' ? 'Facility amount' : 'Commitment' }} ({{ cur }})<input v-model="ed.amount" inputmode="decimal"></label>
          <label class="label">Likely to commit (%)<input v-model="ed.likelihood" type="number" min="0" max="100"></label>
          <label class="label">Next step date<input v-model="ed.next_date" type="date"></label>
          <label class="label w">Next step<input v-model="ed.next_step" maxlength="300" placeholder="e.g. Send DDQ and data room"></label>
          <label class="label w">Notes<textarea v-model="ed.notes" rows="3" maxlength="3000" /></label></form>
        <p v-if="ed.t.lp_id" class="sub">On the LP register. <NuxtLink :to="'/funds/lps/' + ed.t.lp_id">Open</NuxtLink></p>
      </div>
      <template #foot><button v-if="isGp" class="lk red" @click="removeOne">Remove from pipeline</button><span class="sp" /><button class="btn secondary" @click="ed.open = false">Cancel</button><button v-if="isGp" class="btn" type="submit" form="tgf" :disabled="ed.busy">Save</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.lpp { display: grid; grid-template-columns: 270px 1fr; gap: 18px; align-items: start; } .side { background: var(--c-paper-2); padding: 16px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 12px; }
.back { color: var(--c-muted); font-size: 13px; text-decoration: none; } .side h1 { font-size: 22px; margin: 6px 0 0; } .ty { font-size: 13px; color: var(--c-ink-soft); } .tie { display: flex; flex-direction: column; gap: 2px; font-size: 13px; margin: 6px 0 10px; } .tie a { color: var(--c-blue-deep); text-decoration: none; } .tie span { color: var(--c-muted); }
.sr { display: flex; justify-content: space-between; gap: 8px; background: none; border: 0; padding: 8px 10px; font: inherit; font-size: 13.5px; cursor: pointer; text-align: left; } .sr.on { background: #e6e4dd; } .sr em { font-style: normal; color: var(--c-ink-soft); white-space: nowrap; font-size: 12.5px; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 8px; vertical-align: middle; } .acts { margin-top: 10px; font-size: 13px; color: var(--c-muted); }
.lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); } .main { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); background: #fff; border: 1px solid var(--c-rule); } .stats > div { padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; } .stats > div + div { border-left: 1px solid var(--c-rule); } .stats em { font-style: normal; font-size: 12px; color: var(--c-muted); } .stats b { font-size: 20px; font-weight: 500; color: var(--c-navy); } .stats span { font-size: 12px; color: var(--c-muted); }
.pb { position: relative; height: 6px; background: #e2e1dc; } .pb i { position: absolute; left: 0; top: 0; bottom: 0; } .pb .c { background: #c9a35a; } .pb .w { background: var(--c-navy); }
.top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .top input { min-width: 220px; } .sp { flex: 1; } input, select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.ok { background: var(--c-paper-2); padding: 8px 12px; font-size: 13.5px; margin: 0; } .error { color: var(--c-danger); margin: 0; } .bulk { display: flex; gap: 10px; align-items: center; background: var(--c-signal-soft); padding: 8px 12px; } .btn.sm { padding: 5px 10px; font-size: 12.5px; }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 12px; border-bottom: 1px solid var(--c-rule); } th.n, td.n { text-align: right; }
td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } tbody tr { cursor: pointer; } tbody tr:hover { background: #fafaf8; } .ck { width: 34px; }
.sub { display: block; font-size: 12.5px; color: var(--c-muted); } .sub.due { color: var(--c-danger); } .tag { display: inline-block; margin-top: 4px; font-size: 11px; padding: 1px 6px; background: var(--c-paper-2); color: var(--c-ink-soft); } .ac { display: block; margin-left: auto; margin-top: 3px; font-size: 12.5px; }
.ss { border: 0; border-left: 3px solid; font-size: 12.5px; padding: 3px 8px; background: #f6f6f3; cursor: pointer; } .fit { display: inline-block; font-size: 12px; padding: 1px 7px; background: #f1f0ec; } .fit.hi { background: #e3e8f2; color: var(--c-navy); } .fit.md { background: #f6efdf; color: #7a5a14; }
.pk { display: flex; flex-direction: column; gap: 10px; } .pl { max-height: 380px; overflow: auto; display: flex; flex-direction: column; } .ck2 { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .ck2 em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); }
.tf { display: flex; flex-direction: column; gap: 8px; } .tf p { margin: 0; } .tf a { color: var(--c-blue-deep); } .md { font-size: 13.5px; color: var(--c-ink-soft); background: var(--c-paper-2); padding: 8px 10px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 6px; } .w { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
@media (max-width: 1000px) { .lpp { grid-template-columns: 1fr; } .side { position: static; } .stats { grid-template-columns: 1fr 1fr; } }
</style>
