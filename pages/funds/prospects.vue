<script setup lang="ts">
import { shortAmount } from '~/shared/compact'
// Prospective LPs: family offices, funds of funds, endowments, foundations, pensions, sovereign funds, insurers,
// corporates, banks, DFIs, lenders and individuals, with their mandate, ticket and contact; imported from a list or a
// Google Sheet, found with AI, or added by hand; added to the LP pipelines.
useHead({ title: 'LP prospects' })
interface P { id: string; name: string; kind: string; capital: string; country: string | null; regions: string[]; sectors: string[]; aum_usd: number | null; ticket_min_usd: number | null; ticket_max_usd: number | null; mandate: string | null; backs_emerging: boolean | null
  website: string | null; contact_name: string | null; contact_title: string | null; email: string | null; linkedin: string | null; phone: string | null; notes: string | null; sources: string[]; source: string; lp_id: string | null; added: string; priority: string | null; extra: Record<string, string>; pipelines: { pipeline_id: string; pipeline: string; kind: string; stage: string; stage_kind: string; amount: number | null }[] }
const { data, refresh } = await useFetch<{ items: P[]; pipelines: { id: string; name: string; kind: string; status: string }[]; kinds: Record<string, string>; capital: Record<string, string>; extra: Record<string, string> }>('/api/funds/prospects')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const isGp = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const q = ref(''), kind = ref(''), cap = ref(''), pri = ref(''), sel = ref<string[]>([]), okMsg = ref(''), msg = ref('')
const shown = computed(() => (data.value?.items ?? []).filter((p) => (!kind.value || p.kind === kind.value) && (!pri.value || p.priority === pri.value) && (!cap.value || (cap.value === 'debt' ? p.capital !== 'equity' : p.capital !== 'debt')) && (!q.value || [p.name, p.country, p.mandate, p.contact_name, p.regions.join(' '), p.sectors.join(' ')].join(' ').toLowerCase().includes(q.value.toLowerCase()))))
const priorities = computed(() => [...new Set((data.value?.items ?? []).map((p) => p.priority).filter((x): x is string => !!x))].sort())
const counts = computed(() => { const c: Record<string, number> = {}; for (const p of data.value?.items ?? []) c[p.kind] = (c[p.kind] ?? 0) + 1; return c })
const usdS = (v: number | null) => (v == null ? '' : shortAmount(v))
const ticket = (p: P) => (p.ticket_min_usd || p.ticket_max_usd ? usdS(p.ticket_min_usd) + (p.ticket_max_usd && p.ticket_max_usd !== p.ticket_min_usd ? '–' + usdS(p.ticket_max_usd) : '') : '')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
// Bulk add, import, AI search.
const add = reactive({ open: false, mode: 'import' as 'import' | 'find' })
function done(m: string) { add.open = false; okMsg.value = m; void refresh() }
const toPl = ref(''), plOpen = ref(false)
async function addToPipeline() {
  if (!toPl.value || !sel.value.length) return
  msg.value = ''
  try { const r = await $fetch<{ changed: number }>('/api/funds/pipelines/' + toPl.value + '/targets', { method: 'POST', body: { add: sel.value } }); okMsg.value = r.changed + ' added to ' + (data.value?.pipelines.find((p) => p.id === toPl.value)?.name ?? 'the pipeline') + (r.changed < sel.value.length ? ' (' + (sel.value.length - r.changed) + ' already in it)' : '') + '.'; sel.value = []; toPl.value = ''; await refresh() }
  catch (e) { msg.value = err(e) }
}
// One LP: view and edit.
const ed = reactive({ open: false, d: {} as Record<string, any>, msg: '', busy: false })
function open(p?: P) { ed.d = p ? { ...p, regions: p.regions.join(', '), sectors: p.sectors.join(', ') } : { name: '', kind: 'family_office', capital: 'equity', country: '', regions: '', sectors: '', aum_usd: '', ticket_min_usd: '', ticket_max_usd: '', mandate: '', backs_emerging: null, website: '', contact_name: '', contact_title: '', email: '', linkedin: '', phone: '', notes: '' }; ed.msg = ''; ed.open = true }
async function saveEd() {
  ed.busy = true; ed.msg = ''
  const d = ed.d, list = (s: string) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const nz = (v: unknown) => (v === '' || v == null ? null : Number(v))
  try { await $fetch('/api/funds/prospects', { method: 'POST', body: { id: d.id, name: d.name, kind: d.kind, capital: d.capital, country: d.country ?? '', regions: list(d.regions), sectors: list(d.sectors), aum_usd: nz(d.aum_usd), ticket_min_usd: nz(d.ticket_min_usd), ticket_max_usd: nz(d.ticket_max_usd), mandate: d.mandate ?? '', backs_emerging: d.backs_emerging, website: d.website ?? '', contact_name: d.contact_name ?? '', contact_title: d.contact_title ?? '', email: d.email ?? '', linkedin: d.linkedin ?? '', phone: d.phone ?? '', notes: d.notes ?? '' } }); ed.open = false; await refresh() }
  catch (e) { ed.msg = err(e) } finally { ed.busy = false }
}
async function del() { if (!await askConfirm('Remove ' + ed.d.name + ' from the LP list and every pipeline?')) return; try { await $fetch('/api/funds/prospects/' + ed.d.id, { method: 'DELETE' }); ed.open = false; await refresh() } catch (e) { ed.msg = err(e) } }
const STK: Record<string, string> = { committed: 'c', won: 'w', lost: 'l' }
function created(id: string) { plOpen.value = false; navigateTo('/funds/pipelines/' + id) }
</script>
<template>
  <section v-if="data" class="lp">
    <NuxtLink to="/funds" class="back">← Funds &amp; LPs</NuxtLink>
    <div class="head"><div><h1>LP prospects</h1><p class="mut">Family offices, funds of funds, endowments, foundations, pensions, sovereign funds, insurers, corporates, banks, DFIs, lenders and individuals you could raise from: for a fund, a debt facility or a co-investment.</p></div>
      <div v-if="isGp" class="tools"><button class="btn secondary" @click="add.mode = 'import'; add.open = true">Import list or Google Sheet</button><button class="btn secondary" @click="add.mode = 'find'; add.open = true">Find LPs with AI</button><button class="btn secondary" @click="open()">Add LP</button><button class="btn" @click="plOpen = true">New pipeline</button></div></div>
    <p v-if="okMsg" class="ok">{{ okMsg }}</p><p v-if="msg" class="error">{{ msg }}</p>
    <div class="flt"><input v-model="q" placeholder="Search name, mandate, region, contact" aria-label="Search"><select v-model="kind" aria-label="Type"><option value="">All types ({{ data.items.length }})</option><option v-for="(l, k) in data.kinds" :key="k" :value="k" :disabled="!counts[k]">{{ l }}{{ counts[k] ? ' (' + counts[k] + ')' : '' }}</option></select><select v-model="cap" aria-label="Capital"><option value="">Equity and debt</option><option value="equity">Fund commitments</option><option value="debt">Debt / credit</option></select><select v-if="priorities.length" v-model="pri" aria-label="Priority"><option value="">Any priority</option><option v-for="x in priorities" :key="x" :value="x">{{ x }}</option></select></div>
    <div v-if="sel.length" class="bulk"><b>{{ sel.length }} selected</b><select v-model="toPl"><option value="">Add to pipeline…</option><option v-for="p in data.pipelines.filter((x) => x.status === 'open')" :key="p.id" :value="p.id">{{ p.name }}</option></select><button class="btn sm" :disabled="!toPl" @click="addToPipeline">Add</button><button class="lk" @click="sel = []">Clear</button></div>
    <div class="box"><table v-if="shown.length" data-nosearch><thead><tr><th class="ck"><input type="checkbox" :checked="sel.length === shown.length && shown.length > 0" aria-label="Select all" @change="sel = ($event.target as HTMLInputElement).checked ? shown.map((p) => p.id) : []"></th><th>LP</th><th>Type</th><th>Ticket / AUM</th><th>Mandate</th><th>Contact</th><th>Pipelines</th></tr></thead>
      <tbody><tr v-for="p in shown" :key="p.id" @click="open(p)"><td class="ck" @click.stop><input v-model="sel" type="checkbox" :value="p.id" :aria-label="'Select ' + p.name"></td>
        <td><b>{{ p.name }}</b><span v-if="p.priority" class="pr">{{ p.priority }}</span><span v-if="p.extra?.fit" class="pr fit">{{ p.extra.fit }}</span><span class="sub">{{ [p.country, p.regions.join(', ')].filter(Boolean).join(' · ') }}</span><span v-if="p.lp_id" class="tag">On the LP register</span><span v-if="p.backs_emerging" class="tag em">Backs emerging managers</span></td>
        <td>{{ data.kinds[p.kind] ?? p.kind }}<span class="sub">{{ data.capital[p.capital] }}</span></td>
        <td>{{ ticket(p) || '—' }}<span v-if="p.aum_usd" class="sub">AUM {{ usdS(p.aum_usd) }}</span></td>
        <td class="md">{{ (p.mandate || p.notes || '').slice(0, 160) || '—' }}</td>
        <td>{{ p.contact_name || '—' }}<span v-if="p.contact_title" class="sub">{{ p.contact_title }}</span><span v-if="p.email" class="sub">{{ p.email }}</span></td>
        <td><NuxtLink v-for="x in p.pipelines" :key="x.pipeline_id" :to="'/funds/pipelines/' + x.pipeline_id" class="pc" :class="STK[x.stage_kind]" @click.stop>{{ x.pipeline }} · {{ x.stage }}</NuxtLink><span v-if="!p.pipelines.length" class="sub">—</span></td></tr></tbody></table>
      <EmptyState v-else icon="users" :title="data.items.length ? 'No LPs match' : 'No LP prospects yet'" :text="data.items.length ? 'Change the search or filters.' : 'Import your LP list (Excel, CSV, PDF, Word or a Google Sheet), or let AI find LPs that fit your fund\'s mandate.'"><div v-if="!data.items.length && isGp" class="tools"><button class="btn" @click="add.mode = 'import'; add.open = true">Import a list</button><button class="btn secondary" @click="add.mode = 'find'; add.open = true">Find LPs with AI</button></div></EmptyState></div>
    <LpAdd :open="add.open" :mode="add.mode" @close="add.open = false" @done="done" />
    <LpPipelineForm :open="plOpen" @close="plOpen = false" @saved="created" />
    <AppModal :open="ed.open" :title="ed.d.id ? ed.d.name : 'Add an LP'" wide @close="ed.open = false">
      <form id="lpe" class="g3" @submit.prevent="saveEd">
        <label class="label w2">Name<input v-model="ed.d.name" required maxlength="200"></label>
        <label class="label">Type<select v-model="ed.d.kind"><option v-for="(l, k) in data.kinds" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Invests through<select v-model="ed.d.capital"><option v-for="(l, k) in data.capital" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Headquarters<input v-model="ed.d.country" maxlength="100"></label>
        <label class="label">Backs emerging managers<select v-model="ed.d.backs_emerging"><option :value="null">Not known</option><option :value="true">Yes</option><option :value="false">No</option></select></label>
        <label class="label">Regions (comma separated)<input v-model="ed.d.regions" maxlength="400"></label>
        <label class="label">Sectors (comma separated)<input v-model="ed.d.sectors" maxlength="400"></label>
        <label class="label">AUM (USD)<input v-model="ed.d.aum_usd" inputmode="decimal"></label>
        <label class="label">Ticket from (USD)<input v-model="ed.d.ticket_min_usd" inputmode="decimal"></label>
        <label class="label">Ticket to (USD)<input v-model="ed.d.ticket_max_usd" inputmode="decimal"></label>
        <label class="label">Website<input v-model="ed.d.website" maxlength="300" placeholder="https://"></label>
        <label class="label w3">Mandate<textarea v-model="ed.d.mandate" rows="2" maxlength="2000" placeholder="What they commit to: fund types, stages, sectors, regions, ticket" /></label>
        <label class="label">Contact<input v-model="ed.d.contact_name" maxlength="200"></label>
        <label class="label">Title<input v-model="ed.d.contact_title" maxlength="200"></label>
        <label class="label">Email<input v-model="ed.d.email" type="email" maxlength="254"></label>
        <label class="label">LinkedIn<input v-model="ed.d.linkedin" maxlength="300" placeholder="https://linkedin.com/in/…"></label>
        <label class="label">Phone<input v-model="ed.d.phone" maxlength="60"></label><span />
        <label class="label w3">Notes<textarea v-model="ed.d.notes" rows="3" maxlength="3000" /></label>
        <dl v-if="ed.d.id && Object.keys(ed.d.extra ?? {}).length" class="w3 ex"><template v-for="(l, k) in data.extra" :key="k"><div v-if="ed.d.extra?.[k]"><dt>{{ l }}</dt><dd><a v-if="/^https?:/.test(ed.d.extra[k])" :href="ed.d.extra[k]" target="_blank" rel="noopener">{{ ed.d.extra[k].replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) }}</a><template v-else>{{ ed.d.extra[k] }}</template></dd></div></template></dl>
        <div v-if="ed.d.sources?.length" class="w3 src">Sources: <a v-for="s in ed.d.sources" :key="s" :href="s" target="_blank" rel="noopener">{{ s.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50) }}</a></div>
        <div v-if="ed.d.pipelines?.length" class="w3 src">In: <NuxtLink v-for="x in ed.d.pipelines" :key="x.pipeline_id" :to="'/funds/pipelines/' + x.pipeline_id">{{ x.pipeline }} ({{ x.stage }})</NuxtLink><NuxtLink v-if="ed.d.lp_id" :to="'/funds/lps/' + ed.d.lp_id">LP register</NuxtLink></div>
        <p v-if="ed.msg" class="error w3">{{ ed.msg }}</p></form>
      <template #foot><button v-if="ed.d.id && isGp" class="lk red" @click="del">Remove</button><span class="sp" /><button class="btn secondary" @click="ed.open = false">Cancel</button><button v-if="isGp" class="btn" type="submit" form="lpe" :disabled="ed.busy">Save</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.back { color: var(--c-muted); font-size: 13px; text-decoration: none; } .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin: 6px 0 14px; } .head h1 { margin: 0 0 4px; } .head p { max-width: 640px; }
.tools { display: flex; gap: 8px; flex-wrap: wrap; } .mut { color: var(--c-muted); font-size: 13.5px; margin: 0; } .ok { background: var(--c-paper-2); padding: 8px 12px; font-size: 13.5px; margin: 0 0 10px; } .error { color: var(--c-danger); margin: 0 0 8px; }
.flt { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; } .flt input { flex: 1; min-width: 240px; } input, select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.bulk { display: flex; gap: 10px; align-items: center; background: var(--c-signal-soft); padding: 8px 12px; margin-bottom: 8px; } .btn.sm { padding: 5px 10px; font-size: 12.5px; } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 12px; border-bottom: 1px solid var(--c-rule); }
td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } tbody tr { cursor: pointer; } tbody tr:hover { background: #fafaf8; } .ck { width: 34px; }
.sub { display: block; font-size: 12.5px; color: var(--c-muted); } .md { max-width: 340px; color: var(--c-ink-soft); font-size: 13px; }
.tag { display: inline-block; margin: 4px 6px 0 0; font-size: 11px; padding: 1px 6px; background: var(--c-paper-2); color: var(--c-ink-soft); } .tag.em { background: #e9ecf5; color: #2c3e70; }
.pc { display: block; font-size: 12px; color: var(--c-ink-soft); text-decoration: none; padding: 1px 0; } .pc.c { color: #7a5a14; } .pc.w { color: var(--c-navy); font-weight: 600; } .pc.l { color: var(--c-muted); text-decoration: line-through; }
.g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; } .w2 { grid-column: span 2; } .w3 { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; } .sp { flex: 1; }
.pr { display: inline-block; margin-left: 8px; font-size: 11px; font-weight: 600; padding: 1px 6px; background: var(--c-navy); color: #fff } .pr.fit { background: var(--c-paper-2); color: var(--c-ink-soft); font-weight: 400 }
.ex { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin: 0; padding: 10px 12px; background: var(--c-paper-2) } .ex dt { font-size: 11.5px; color: var(--c-muted) } .ex dd { margin: 2px 0 0; font-size: 13px } .ex a { color: var(--c-blue-deep) }
.src { font-size: 12.5px; color: var(--c-muted); display: flex; gap: 10px; flex-wrap: wrap; } .src a { color: var(--c-blue-deep); }
@media (max-width: 800px) { .g3 { grid-template-columns: 1fr; } .w2 { grid-column: auto; } }
</style>
