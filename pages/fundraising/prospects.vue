<script setup lang="ts">
import { shortAmount } from '~/shared/compact'
import { COUNTRIES } from '~/shared/countries'
// Find investors and grants for your round: ranked by fit with your location, stage, sector and amount. Pick the ones
// you like and add them to a pipeline (or start a new one).
useHead({ title: 'Find investors and grants' })
const FTABS = [['overview', 'Overview'], ['round', 'Pipelines'], ['find', 'Find investors & grants'], ['room', 'Data room'], ['memo', 'Deal memo'], ['safe', 'SAFEs'], ['nda', 'NDAs']] as const
interface P { id: string; kind: 'investor' | 'grant'; name: string; type: string; regions: string[]; stages: string[]; sectors: string[]; min_usd: number | null; max_usd: number | null; website: string | null; description: string | null; how_to_apply: string | null; deadline: string | null; score: number; reasons: string[]; in_pipeline: boolean }
interface D { query: { country: string; stage: string; sectors: string[]; amount: number | null; kind: string }; items: P[]; pipelines: { id: string; name: string; target: number | null; currency: string; status: string }[]; stages: Record<string, string>; sector_labels: Record<string, string>; types: Record<string, string>; company: string; currency: string }
const f = reactive({ country: '', stage: '', sectors: [] as string[], amount: '' as string | number, kind: '' })
const qs = computed(() => ({ country: f.country, stage: f.stage, sectors: f.sectors.join(','), amount: f.amount || undefined, kind: f.kind || undefined }))
const { data, refresh, pending } = await useFetch<D>('/api/fundraising/prospects', { query: qs, watch: false })
const ready = ref(false)
watchEffect(() => { if (data.value && !ready.value) { Object.assign(f, { country: data.value.query.country, stage: data.value.query.stage, sectors: [...data.value.query.sectors], amount: data.value.query.amount ?? '' }); ready.value = true } })
let t: ReturnType<typeof setTimeout> | undefined
watch(() => JSON.stringify(qs.value), () => { if (!ready.value) return; clearTimeout(t); t = setTimeout(() => refresh(), 250) })
const toggleSector = (s: string) => { f.sectors = f.sectors.includes(s) ? f.sectors.filter((x) => x !== s) : [...f.sectors, s] }
const sel = ref<string[]>([])
const toggle = (id: string) => { sel.value = sel.value.includes(id) ? sel.value.filter((x) => x !== id) : [...sel.value, id] }
const items = computed(() => data.value?.items ?? [])
const counts = computed(() => ({ investor: items.value.filter((i) => i.kind === 'investor').length, grant: items.value.filter((i) => i.kind === 'grant').length, strong: items.value.filter((i) => i.score >= 70).length }))
const money = (n: number) => shortAmount(n)
const range = (p: P) => (p.min_usd && p.max_usd && p.min_usd === p.max_usd ? money(p.min_usd) : p.min_usd || p.max_usd ? (p.min_usd ? money(p.min_usd) : 'Up to') + (p.max_usd ? (p.min_usd ? '–' : ' ') + money(p.max_usd) : '+') : '')
const fit = (s: number) => (s >= 70 ? 'Strong fit' : s >= 45 ? 'Good fit' : 'Possible')
// Add to a pipeline
const add = reactive({ open: false, to: '', name: '', target: '' as string | number, busy: false, msg: '', ok: '' })
function openAdd() { Object.assign(add, { open: true, to: data.value?.pipelines.find((p) => p.status === 'open')?.id ?? (data.value?.pipelines[0]?.id ?? 'new'), name: 'Seed round', target: f.amount || '', msg: '' }) }
async function doAdd() {
  add.busy = true; add.msg = ''
  try {
    const r = await $fetch<{ added: number; skipped: number; pipeline_id: string }>('/api/fundraising/prospects/add', { method: 'POST', body: { ids: sel.value, ...(add.to === 'new' ? { new_pipeline: { name: add.name, target: add.target === '' ? null : Number(add.target), currency: data.value?.currency === 'NGN' ? 'NGN' : 'USD' } } : { pipeline_id: add.to }), remember: { stage: f.stage, sectors: f.sectors } } })
    add.open = false; add.ok = r.added + ' added to your pipeline' + (r.skipped ? ' (' + r.skipped + ' already there)' : '') + '.'; sel.value = []; await refresh()
    setTimeout(() => navigateTo('/fundraising/pipelines/' + r.pipeline_id), 900)
  } catch (e) { add.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add them.' } finally { add.busy = false }
}
</script>
<template>
  <section v-if="data" class="pz">
    <div class="hd"><div><h1>Fundraising</h1></div></div>
    <nav class="tabs"><NuxtLink v-for="[k, l] in FTABS" :key="k" :to="k === 'find' ? '/fundraising/prospects' : '/fundraising?t=' + k" :class="{ on: k === 'find' }">{{ l }}</NuxtLink></nav>
    <div class="hd"><div><h2 class="h2">Find investors and grants</h2><p class="lead">Funds, accelerators and non-dilutive grants that fit {{ data.company }}: where you are, your stage and sector, and how much you are raising. Add the ones you like to a pipeline and track every conversation.</p></div></div>
    <div class="fx-stats">
      <StatTile icon="users" tone="b" label="Investors that fit" :value="counts.investor" clickable :on="f.kind === 'investor'" @click="f.kind = f.kind === 'investor' ? '' : 'investor'" />
      <StatTile icon="money" tone="g" label="Grants and programs" :value="counts.grant" note="non-dilutive" clickable :on="f.kind === 'grant'" @click="f.kind = f.kind === 'grant' ? '' : 'grant'" />
      <StatTile icon="check" tone="c" label="Strong fits" :value="counts.strong" note="score 70 and above" />
    </div>
    <div class="flt card">
      <label class="label">Where you are<select v-model="f.country"><option value="">Anywhere</option><option v-for="c in COUNTRIES" :key="c">{{ c }}</option></select></label>
      <label class="label">Amount you are raising (USD)<input v-model="f.amount" inputmode="decimal" placeholder="e.g. 500000"></label>
      <div class="label w">Stage<div class="chips"><button v-for="(l, k) in data.stages" :key="k" type="button" :class="{ on: f.stage === k }" @click="f.stage = f.stage === k ? '' : String(k)">{{ l }}</button></div></div>
      <div class="label w">Sector<div class="chips"><button v-for="(l, k) in data.sector_labels" :key="k" type="button" :class="{ on: f.sectors.includes(String(k)) }" @click="toggleSector(String(k))">{{ l }}</button></div></div>
    </div>
    <p v-if="add.ok" class="ok">{{ add.ok }}</p>
    <div class="res" :class="{ dim: pending }">
      <article v-for="p in items" :key="p.id" class="pc" :class="{ on: sel.includes(p.id) }">
        <div class="pt"><label class="ck"><input type="checkbox" :checked="sel.includes(p.id)" :disabled="p.in_pipeline" @change="toggle(p.id)"></label>
          <div class="pn"><b>{{ p.name }}</b><span>{{ data.types[p.type] ?? p.type }}<template v-if="range(p)"> · {{ range(p) }}</template></span></div>
          <span class="kd" :class="p.kind">{{ p.kind === 'grant' ? 'Grant' : 'Investor' }}</span></div>
        <div class="sc"><div class="bar"><i :style="{ width: p.score + '%' }" :class="{ hi: p.score >= 70, md: p.score >= 45 && p.score < 70 }" /></div><em>{{ fit(p.score) }}</em></div>
        <p v-if="p.description" class="ds">{{ p.description }}</p>
        <div class="tags"><span v-for="r in p.reasons" :key="r">{{ r }}</span></div>
        <div class="pf"><span v-if="p.how_to_apply" class="ha">{{ p.how_to_apply }}<template v-if="p.deadline"> · {{ p.deadline }}</template></span><span class="sp" /><a v-if="p.website" :href="webUrl(p.website)" target="_blank" rel="noopener">Website ↗</a><span v-if="p.in_pipeline" class="inp">In your pipeline</span></div>
      </article>
      <EmptyState v-if="!items.length" card icon="fundraising" title="No matches yet" text="Try another location or stage, or clear the sector filters." />
    </div>
    <p class="note">This list is kept by the Finvry team and updated as programs change. Check eligibility and deadlines on each official site before applying.</p>
    <div v-if="sel.length" class="act"><span><b>{{ sel.length }}</b> selected</span><button type="button" class="btn secondary" @click="sel = []">Clear</button><button type="button" class="btn" @click="openAdd">Add to pipeline</button></div>
    <AppModal :open="add.open" title="Add to a pipeline" @close="add.open = false">
      <div class="am"><label class="label">Pipeline<select v-model="add.to"><option v-for="p in data.pipelines" :key="p.id" :value="p.id">{{ p.name }}{{ p.status === 'closed' ? ' (closed)' : '' }}</option><option value="new">+ Create a new pipeline</option></select></label>
        <template v-if="add.to === 'new'"><label class="label">Pipeline name<input v-model="add.name" maxlength="120"></label><label class="label">Target ({{ data.currency === 'NGN' ? 'NGN' : 'USD' }})<input v-model="add.target" inputmode="decimal" placeholder="Optional"></label></template>
        <p class="s">They are added at the first stage, with their website and how to apply in the notes.</p><p v-if="add.msg" class="error">{{ add.msg }}</p></div>
      <template #foot><button type="button" class="btn secondary" @click="add.open = false">Cancel</button><button type="button" class="btn" :disabled="add.busy || (add.to === 'new' && !add.name.trim())" @click="doAdd">{{ add.busy ? 'Adding…' : 'Add ' + sel.length }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 14px 0 16px; overflow-x: auto; } .tabs a { padding: 10px 0; color: var(--c-muted); text-decoration: none; border-bottom: 2px solid transparent; white-space: nowrap; } .tabs a.on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .hd h1 { margin: 0; } .h2 { margin: 0; font-size: 20px; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 820px; }
.flt { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; margin-bottom: 16px; } .flt .w { grid-column: 1 / -1; } .label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.flt select, .flt input, .am select, .am input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 0; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.res { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; transition: opacity .15s; } .res.dim { opacity: .55; }
.pc { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; } .pc.on { border-color: var(--c-navy); box-shadow: inset 3px 0 0 var(--c-navy); }
.pt { display: flex; gap: 10px; align-items: flex-start; } .ck input { margin-top: 4px; width: 16px; height: 16px; } .pn { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .pn b { font-size: 15.5px; } .pn span { font-size: 12.5px; color: var(--c-muted); }
.kd { font-size: 11.5px; font-weight: 600; padding: 3px 9px; background: #eef4ff; color: #2c5cc5; } .kd.grant { background: #e8f0f8; color: #235278; }
.sc { display: flex; align-items: center; gap: 10px; } .bar { flex: 1; height: 6px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-rule-strong); } .bar i.md { background: var(--c-blue-deep); } .bar i.hi { background: var(--c-ok); } .sc em { font-style: normal; font-size: 12px; color: var(--c-muted); white-space: nowrap; }
.ds { margin: 0; font-size: 13.5px; color: var(--c-ink-soft); line-height: 1.5; } .tags { display: flex; gap: 6px; flex-wrap: wrap; } .tags span { font-size: 11.5px; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); }
.pf { display: flex; align-items: center; gap: 10px; font-size: 12.5px; border-top: 1px solid var(--c-rule); padding-top: 10px; } .ha { color: var(--c-muted); } .sp { flex: 1; } .pf a { color: var(--c-blue-deep); text-decoration: none; white-space: nowrap; } .inp { color: var(--c-ok); font-weight: 600; white-space: nowrap; }
.note { font-size: 12.5px; color: var(--c-muted); margin: 16px 0 70px; } .ok { color: var(--c-ok); }
.act { position: sticky; bottom: 12px; display: flex; gap: 10px; align-items: center; justify-content: flex-end; background: #fff; border: 1px solid var(--c-navy); padding: 10px 14px; box-shadow: 0 8px 24px rgba(12,26,46,.12); } .act span { margin-right: auto; font-size: 14px; }
.am { display: flex; flex-direction: column; gap: 12px; } .s { font-size: 12.5px; color: var(--c-muted); margin: 0; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 800px) { .flt { grid-template-columns: 1fr; } }
</style>
