<script setup lang="ts">
// Add prospective LPs in bulk: import a list (drop Excel / CSV / PDF / Word, or paste a Google Sheet link), or find
// them with AI against a mandate. The result comes back to pick from (ranked by fit when there is a pipeline or a
// mandate), then is saved to the LP list and, with a pipeline, added to it.
const props = defineProps<{ open: boolean; mode: 'import' | 'find'; pipelineId?: string; pipelineName?: string; mandate?: Record<string, unknown> }>()
const emit = defineEmits<{ close: []; done: [msg: string] }>()
interface Row { name: string; kind: string; capital: string; country: string; regions: string[]; sectors: string[]; aum_usd: number | null; ticket_min_usd: number | null; ticket_max_usd: number | null; mandate: string; website: string; contact_name: string; contact_title: string; email: string; linkedin: string; notes: string; sources: string[]; likelihood: number | null; reason: string; on_list: boolean }
const KINDS: Record<string, string> = { family_office: 'Family office', fund_of_funds: 'Fund of funds', endowment: 'Endowment', foundation: 'Foundation', pension: 'Pension fund', sovereign: 'Sovereign wealth fund', insurance: 'Insurer', corporate: 'Corporate', bank: 'Bank', dfi: 'Development finance (DFI)', private_credit: 'Private credit / lender', asset_manager: 'Asset manager', hnwi: 'High-net-worth individual', angel: 'Angel / syndicate', other: 'Other' }
const st = reactive({ url: '', rows: [] as Row[], pick: [] as number[], notes: '', from: '', source: 'import', saving: false, msg: '', filter: '' })
const m = reactive({ fund: '', strategy: '', size_usd: '' as string | number, ticket_usd: '' as string | number, stages: '', sectors: '', regions: '', capital: 'equity', manager: '', kinds: [] as string[], focus: '', vintage: '', count: 20 })
watch(() => props.open, (o) => { if (!o) return; Object.assign(st, { url: '', rows: [], pick: [], notes: '', from: '', saving: false, msg: '', filter: '' }); job.fail.value = null; const x = props.mandate ?? {}; for (const k of Object.keys(m) as (keyof typeof m)[]) if (x[k] !== undefined && x[k] !== null) (m as Record<string, unknown>)[k] = x[k] })
const job = useAiJob<{ rows: Row[]; notes?: string; from?: string; tab?: string; source: string }>()
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function got(id: string) {
  const r = await job.follow(id); if (!r) return
  Object.assign(st, { rows: r.rows, notes: r.notes ?? '', from: r.from ? r.from + (r.tab ? ' (' + r.tab + ')' : '') : '', source: r.source })
  st.pick = r.rows.map((x, i) => (!x.on_list && (x.likelihood == null || x.likelihood >= 40) ? i : -1)).filter((i) => i >= 0)
  if (!r.rows.length) st.msg = 'No LPs were found.'
}
async function upFile(ev: Event) {
  const fs = Array.from((ev.target as HTMLInputElement).files ?? []); if (!fs.length) return
  const fd = new FormData(); for (const f of fs) fd.append('file', f); if (props.pipelineId) fd.append('pipeline_id', props.pipelineId)
  st.msg = ''; try { await got((await $fetch<{ id: string }>('/api/funds/prospects/import', { method: 'POST', body: fd })).id) } catch (e) { st.msg = err(e) }
}
async function fromLink() {
  const fd = new FormData(); fd.append('url', st.url.trim()); if (props.pipelineId) fd.append('pipeline_id', props.pipelineId)
  st.msg = ''; try { await got((await $fetch<{ id: string }>('/api/funds/prospects/import', { method: 'POST', body: fd })).id) } catch (e) { st.msg = err(e) }
}
async function find() {
  st.msg = ''
  try { await got((await $fetch<{ id: string }>('/api/funds/prospects/find', { method: 'POST', body: { pipeline_id: props.pipelineId, count: m.count, mandate: { ...m, size_usd: Number(m.size_usd) || null, ticket_usd: Number(m.ticket_usd) || null, count: undefined } } })).id) }
  catch (e) { st.msg = err(e) }
}
const shown = computed(() => st.rows.map((r, i) => ({ r, i })).filter(({ r }) => !st.filter || (st.filter === 'debt' ? r.capital !== 'equity' : r.kind === st.filter)))
const kindsHere = computed(() => [...new Set(st.rows.map((r) => r.kind))])
const pickAll = (on: boolean) => { st.pick = on ? shown.value.map(({ i }) => i) : [] }
async function save() {
  st.saving = true; st.msg = ''
  try {
    const r = await $fetch<{ added: number; updated: number; in_pipeline: number }>('/api/funds/prospects/apply', { method: 'POST', body: { source: st.source, pipeline_id: props.pipelineId, rows: st.pick.map((i) => { const { on_list: _o, ...x } = st.rows[i]!; return x }) } })
    emit('done', r.added + ' LP' + (r.added === 1 ? '' : 's') + ' added' + (r.updated ? ', ' + r.updated + ' already on the list (details filled in)' : '') + (props.pipelineId ? '; ' + r.in_pipeline + ' added to ' + (props.pipelineName ?? 'the pipeline') : '') + '.')
  } catch (e) { st.msg = err(e) } finally { st.saving = false }
}
const usdS = (v: number | null) => (v == null ? '' : '$' + (v >= 1e9 ? (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : v))
const ticket = (r: Row) => (r.ticket_min_usd || r.ticket_max_usd ? usdS(r.ticket_min_usd) + (r.ticket_max_usd && r.ticket_max_usd !== r.ticket_min_usd ? '–' + usdS(r.ticket_max_usd) : '') : '')
const stageText = computed(() => job.stage.value === 'fetch' ? 'Opening the sheet…' : job.stage.value === 'search' ? 'Searching for LPs that fit the mandate… (a few minutes)' : job.stage.value === 'score' ? 'Ranking them by fit' + (job.progress.value.total ? ' (' + (job.progress.value.done ?? 0) + ' of ' + job.progress.value.total + ')' : '') + '…' : 'Reading the list…')
const lk = (v: number | null) => (v == null ? '' : v >= 70 ? 'hi' : v >= 45 ? 'md' : 'lo')
</script>
<template>
  <AppModal :open="open" :title="mode === 'find' ? 'Find LPs with AI' : 'Import LPs'" xl @close="emit('close')">
    <div class="la">
      <template v-if="!st.rows.length && !job.busy.value">
        <template v-if="mode === 'import'">
          <p class="mut">Drop your LP list (Excel, CSV, PDF or Word), or paste a Google Sheet link. AI finds each LP and its details (type, mandate, ticket, contacts){{ pipelineId ? ' and ranks them by how likely they are to commit to ' + (pipelineName ?? 'this raise') : '' }}. You pick who to add.</p>
          <DropZone accept=".xlsx,.csv,.pdf,.docx" multiple label="Drop the list here or choose a file" hint="Excel, CSV, PDF or Word, up to 20 MB" @change="upFile" />
          <div class="lnk"><label class="label">Or a Google Sheet / Excel online link<input v-model="st.url" type="url" placeholder="https://docs.google.com/spreadsheets/d/…"></label><button class="btn secondary" :disabled="!/^https:\/\//.test(st.url.trim())" @click="fromLink">Read the sheet</button></div>
          <p class="mut sm">Share the sheet so anyone with the link can view it.</p>
        </template>
        <form v-else id="lpf" class="g2" @submit.prevent="find">
          <p class="mut w">A VC fund raises a blind pool for its strategy, so LPs are matched on the fund's mandate, not on companies. For a debt facility, choose Debt; AI looks for lenders and credit funds. Contacts come from public pages only.</p>
          <label class="label">Vehicle<input v-model="m.fund" maxlength="160" placeholder="e.g. Aidi Ventures Fund I"></label>
          <label class="label">Capital sought<select v-model="m.capital"><option value="equity">LP commitments (equity)</option><option value="debt">Debt / credit</option><option value="both">Both</option></select></label>
          <label class="label w">Strategy<textarea v-model="m.strategy" rows="2" maxlength="600" placeholder="e.g. Pre-seed and seed in African fintech and AI infrastructure, $250K–1M first cheques, reserves for follow-ons" /></label>
          <label class="label">Fund size (USD)<input v-model="m.size_usd" inputmode="decimal" placeholder="15000000"></label>
          <label class="label">LP ticket wanted (USD)<input v-model="m.ticket_usd" inputmode="decimal" placeholder="500000"></label>
          <label class="label">Stages the fund backs<input v-model="m.stages" maxlength="200" placeholder="Pre-seed, seed"></label>
          <label class="label">Vintage<input v-model="m.vintage" maxlength="20" placeholder="2026"></label>
          <label class="label">Sectors<input v-model="m.sectors" maxlength="300" placeholder="Fintech, AI, telecoms"></label>
          <label class="label">Regions<input v-model="m.regions" maxlength="300" placeholder="Nigeria, Africa, US diaspora"></label>
          <label class="label w">The manager<input v-model="m.manager" maxlength="400" placeholder="e.g. First-time fund; GPs have angel-invested in 30+ companies since 2019"></label>
          <div class="label w">LP types<div class="ks"><label v-for="(l, k) in KINDS" :key="k" class="ck"><input v-model="m.kinds" type="checkbox" :value="k"> {{ l }}</label></div><span class="mut sm">None ticked: all types.</span></div>
          <label class="label">Anything else<input v-model="m.focus" maxlength="400" placeholder="e.g. US family offices with Africa exposure"></label>
          <label class="label">How many<select v-model.number="m.count"><option :value="10">10</option><option :value="20">20</option><option :value="30">30</option><option :value="40">40</option></select></label>
        </form>
      </template>
      <p v-if="job.busy.value" class="mut">{{ stageText }} You can keep working; this window can stay open.</p>
      <div v-if="job.fail.value" class="error"><b>{{ job.fail.value.message }}</b><ul><li v-for="a in job.fail.value.advice" :key="a">{{ a }}</li></ul></div>
      <template v-if="st.rows.length">
        <div class="rh"><span>{{ st.rows.length }} found{{ st.from ? ' in ' + st.from : '' }} · {{ st.pick.length }} picked</span><select v-model="st.filter" aria-label="Show"><option value="">All types</option><option value="debt">Debt / credit</option><option v-for="k in kindsHere" :key="k" :value="k">{{ KINDS[k] ?? k }}</option></select><button class="lk" type="button" @click="pickAll(true)">Pick all</button><button class="lk" type="button" @click="pickAll(false)">Clear</button></div>
        <p v-if="st.notes" class="note">{{ st.notes }}</p>
        <div class="tw"><table><thead><tr><th /><th>LP</th><th>Type</th><th>Ticket / AUM</th><th>Mandate</th><th>Contact</th><th v-if="st.rows.some((r) => r.likelihood != null)">Fit</th></tr></thead>
          <tbody><tr v-for="{ r, i } in shown" :key="i" :class="{ off: !st.pick.includes(i) }"><td><input v-model="st.pick" type="checkbox" :value="i" :aria-label="'Pick ' + r.name"></td>
            <td><b>{{ r.name }}</b><span class="sub">{{ [r.country, r.regions.join(', ')].filter(Boolean).join(' · ') }}</span><a v-if="r.website" :href="r.website" target="_blank" rel="noopener" class="sub">{{ r.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') }}</a><span v-if="r.on_list" class="sub tag">Already on your list</span></td>
            <td>{{ KINDS[r.kind] ?? r.kind }}<span class="sub">{{ r.capital === 'debt' ? 'Debt' : r.capital === 'both' ? 'Equity and debt' : 'Equity' }}</span></td>
            <td>{{ ticket(r) || '—' }}<span v-if="r.aum_usd" class="sub">AUM {{ usdS(r.aum_usd) }}</span></td>
            <td class="md">{{ (r.mandate || r.notes).slice(0, 220) }}</td>
            <td>{{ r.contact_name }}<span v-if="r.contact_title" class="sub">{{ r.contact_title }}</span><span v-if="r.email" class="sub">{{ r.email }}</span><a v-if="r.linkedin" :href="r.linkedin" target="_blank" rel="noopener" class="sub">LinkedIn</a></td>
            <td v-if="st.rows.some((x) => x.likelihood != null)"><span v-if="r.likelihood != null" class="fit" :class="lk(r.likelihood)">{{ r.likelihood }}%</span><span class="sub">{{ r.reason }}</span></td></tr></tbody></table></div>
      </template>
      <p v-if="st.msg" class="error">{{ st.msg }}</p>
    </div>
    <template #foot>
      <button v-if="st.rows.length" class="btn secondary" @click="st.rows = []">{{ mode === 'find' ? 'Change the mandate' : 'Use another list' }}</button><span class="sp" />
      <button class="btn secondary" @click="emit('close')">Cancel</button>
      <button v-if="mode === 'find' && !st.rows.length" class="btn" type="submit" form="lpf" :disabled="job.busy.value">{{ job.busy.value ? 'Searching…' : 'Find LPs' }}</button>
      <button v-if="st.rows.length" class="btn" :disabled="st.saving || !st.pick.length" @click="save">{{ st.saving ? 'Adding…' : 'Add ' + st.pick.length + (pipelineId ? ' to ' + (pipelineName ?? 'the pipeline') : ' to the LP list') }}</button>
    </template>
  </AppModal>
</template>
<style scoped>
.la { display: flex; flex-direction: column; gap: 12px; } .mut { color: var(--c-muted); font-size: 13.5px; margin: 0; } .sm { font-size: 12.5px; } .error { color: var(--c-danger); margin: 0; } .sp { flex: 1; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .w { grid-column: 1 / -1; } label.label, div.label { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
input, select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.ks { display: flex; flex-wrap: wrap; gap: 6px 14px; } .ck { display: flex; gap: 6px; align-items: center; font-size: 13px; }
.lnk { display: flex; gap: 10px; align-items: flex-end; } .lnk label { flex: 1; }
.rh { display: flex; gap: 12px; align-items: center; font-size: 13.5px; } .rh span { flex: 1; } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.note { margin: 0; background: var(--c-paper-2); padding: 8px 12px; font-size: 13px; color: var(--c-ink-soft); }
.tw { max-height: 520px; overflow: auto; border: 1px solid var(--c-rule); } table { width: 100%; border-collapse: collapse; } th { position: sticky; top: 0; background: #fff; text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); }
td { padding: 8px 10px; border-bottom: 1px solid var(--c-rule); font-size: 13px; vertical-align: top; } tr.off td { color: var(--c-muted); } .sub { display: block; font-size: 12px; color: var(--c-muted); } a.sub { color: var(--c-blue-deep); } .tag { color: #7a5a14; }
.md { max-width: 320px; color: var(--c-ink-soft); } .fit { display: inline-block; font-size: 12px; padding: 1px 7px; background: #f1f0ec; } .fit.hi { background: #e3e8f2; color: var(--c-navy); } .fit.md { background: #f6efdf; color: #7a5a14; }
@media (max-width: 760px) { .g2 { grid-template-columns: 1fr; } .lnk { flex-direction: column; align-items: stretch; } }
</style>
