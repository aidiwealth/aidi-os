<script setup lang="ts">
// Console: who funds whom, for the Finvry Stage Monitor's "Who could fund you" — investors, lenders and grants with
// their countries, stages, sectors, cheque sizes and criteria. Founders only see providers marked verified. Also the
// Stage Monitor's rules: stage thresholds per region and the weights of each readiness score.
import type { StageRules } from '~/shared/stage'
useHead({ title: 'Finvry · Capital providers' })
interface P { id: string; name: string; kind: string; instrument: string; countries: string[]; stages: string[]; sectors: string[]; ticket_min: number | null; ticket_max: number | null; currency: string; criteria: string | null; link: string | null; source: string | null; verified_on: string | null; affiliate: boolean; active: boolean }
const { data, refresh } = await useFetch<{ providers: P[]; rules: StageRules; can_edit: boolean }>('/api/platform/capital-providers')
const KIND: Record<string, string> = { vc: 'Venture fund', angel_network: 'Angel network', accelerator: 'Accelerator', grant: 'Grant', bank: 'Bank', venture_debt: 'Venture debt', revenue_based: 'Revenue-based finance', dfi: 'Development finance', government: 'Government programme', other: 'Other' }
const STAGES: [string, string][] = [['pre_seed', 'Pre-seed'], ['seed', 'Seed'], ['series_a', 'Series A'], ['series_b', 'Series B'], ['growth', 'Growth']]
const show = ref<'all' | 'verified' | 'todo'>('all'), q = ref('')
const list = computed(() => (data.value?.providers ?? []).filter((p) => (show.value === 'all' || (show.value === 'verified' ? !!p.verified_on : !p.verified_on)) && (!q.value || p.name.toLowerCase().includes(q.value.toLowerCase()))))
const blank = () => ({ id: '', name: '', kind: 'vc', instrument: 'equity', countries: '', stages: [] as string[], sectors: '', ticket_min: '' as string | number, ticket_max: '' as string | number, currency: 'USD', criteria: '', link: '', source: '', verified: false, affiliate: false, active: true })
const f = reactive({ open: false, ...blank() }), msg = ref(''), ok = ref(''), busy = ref(false)
function edit(p?: P) { Object.assign(f, blank(), p ? { ...p, countries: p.countries.join(', '), sectors: p.sectors.join(', '), ticket_min: p.ticket_min ?? '', ticket_max: p.ticket_max ?? '', criteria: p.criteria ?? '', link: p.link ?? '', source: p.source ?? '', verified: !!p.verified_on } : {}, { open: true }); msg.value = '' }
const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
async function save(del = false) {
  if (del && !await askConfirm('Remove ' + f.name + ' from the directory?')) return
  busy.value = true; msg.value = ''
  try { await $fetch('/api/platform/capital-providers', { method: 'POST', body: del ? { id: f.id, delete: true } : { ...f, open: undefined, id: f.id || undefined, countries: split(f.countries), sectors: split(f.sectors) } }); f.open = false; ok.value = del ? 'Removed.' : 'Saved.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
const rules = ref<StageRules | null>(data.value ? structuredClone(toRaw(data.value.rules)) : null)
watch(() => data.value?.rules, (r) => { if (r) rules.value = structuredClone(toRaw(r)) })
const rmsg = ref('')
async function saveRules() { rmsg.value = ''; try { await $fetch('/api/platform/capital-providers', { method: 'POST', body: { rules: rules.value } }); rmsg.value = 'Rules saved.' } catch (e) { rmsg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
const EQ: [string, string][] = [['growth', 'Revenue growth'], ['revenue', 'Revenue for the next round'], ['margin', 'Gross margin'], ['retention', 'Retention'], ['cap_table', 'Cap table'], ['data_room', 'Data room']]
const DB: [string, string][] = [['history', 'Months of revenue'], ['consistency', 'Steady revenue'], ['margin', 'Gross margin'], ['cover', 'Ability to repay'], ['debt', 'Existing debt'], ['bank', 'Bank history']]
const n = computed(() => { const l = data.value?.providers ?? []; return { all: l.length, ver: l.filter((p) => p.verified_on && p.active).length, todo: l.filter((p) => !p.verified_on).length } })
</script>
<template>
  <section v-if="data" class="cp">
    <div class="hd"><div><p class="label">Finvry console</p><h1>Capital providers</h1><p class="lead">Investors, lenders and grants matched to companies in the Stage Monitor by country, stage, sector and instrument. Founders only see verified providers; check each one's details before verifying.</p></div>
      <button v-if="data.can_edit" class="btn" @click="edit()">Add a provider</button></div>
    <div class="fx-stats"><StatTile label="In the directory" :value="n.all" /><StatTile label="Verified and shown" :value="n.ver" /><StatTile label="To check" :value="n.todo" /></div>
    <p v-if="ok" class="ok">{{ ok }}</p>
    <div class="tb"><div class="seg"><button v-for="[k, l] in ([['all', 'All'], ['verified', 'Verified'], ['todo', 'To check']] as const)" :key="k" :class="{ on: show === k }" @click="show = k">{{ l }}</button></div><input v-model="q" placeholder="Search by name" aria-label="Search"></div>
    <div class="box"><table data-nosearch><thead><tr><th>Provider</th><th>Instrument</th><th>Countries</th><th>Stages</th><th>Cheque</th><th>Status</th><th /></tr></thead>
      <tbody><tr v-for="p in list.slice(0, 300)" :key="p.id"><td><b>{{ p.name }}</b><span v-if="p.affiliate" class="chip">Aidi affiliate</span><small>{{ KIND[p.kind] }}{{ p.source ? ' · ' + p.source : '' }}</small></td><td>{{ p.instrument }}</td><td>{{ p.countries.join(', ') || 'Global' }}</td><td>{{ p.stages.map((s) => STAGES.find((x) => x[0] === s)?.[1] ?? s).join(', ') || 'Any' }}</td>
        <td>{{ p.ticket_min === null && p.ticket_max === null ? '—' : (p.ticket_min ?? 0).toLocaleString('en-US') + '–' + (p.ticket_max === null ? '' : p.ticket_max.toLocaleString('en-US')) + ' ' + p.currency }}</td>
        <td>{{ !p.active ? 'Hidden' : p.verified_on ? 'Verified ' + p.verified_on : 'To check' }}</td><td><button v-if="data.can_edit" class="lk" @click="edit(p)">Edit</button></td></tr></tbody></table>
      <p v-if="!list.length" class="mut pad">No providers here yet.</p></div>

    <div v-if="rules" class="box rl"><h2>Stage rules</h2><p class="mut">Thresholds in US dollars. Operating stage comes from the annual revenue run rate; funding stage from money raised on the cap table, unless a priced round names it.</p>
      <table data-nosearch><thead><tr><th>Region</th><th>Seed-level ARR</th><th>Series A-level ARR</th><th>Series B-level ARR</th><th>Pre-seed raised up to</th><th>Seed raised up to</th><th>Series A raised up to</th></tr></thead>
        <tbody><tr v-for="k in (['us', 'ng', 'other'] as const)" :key="k"><td>{{ rules.regions[k].label }}</td><td v-for="x in (['seed', 'series_a', 'series_b'] as const)" :key="x"><input v-model.number="rules.regions[k].arr[x]" type="number" min="0" :disabled="!data.can_edit"></td><td v-for="x in (['pre_seed', 'seed', 'series_a'] as const)" :key="'r' + x"><input v-model.number="rules.regions[k].raised[x]" type="number" min="0" :disabled="!data.can_edit"></td></tr></tbody></table>
      <div class="ws"><div><h3>Equity readiness weights</h3><label v-for="[k, l] in EQ" :key="k">{{ l }}<input v-model.number="(rules.equity as Record<string, number>)[k]" type="number" min="0" max="100" :disabled="!data.can_edit"></label></div>
        <div><h3>Debt readiness weights</h3><label v-for="[k, l] in DB" :key="k">{{ l }}<input v-model.number="(rules.debt as Record<string, number>)[k]" type="number" min="0" max="100" :disabled="!data.can_edit"></label></div></div>
      <div class="row"><button v-if="data.can_edit" class="btn" @click="saveRules">Save rules</button><span class="mut">{{ rmsg }}</span></div></div>

    <AppModal :open="f.open" :title="f.id ? 'Edit ' + f.name : 'Add a provider'" wide @close="f.open = false">
      <div class="frm">
        <label>Name<input v-model="f.name" maxlength="200"></label>
        <label>Kind<select v-model="f.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
        <label>Instrument<select v-model="f.instrument"><option value="equity">Equity</option><option value="debt">Debt</option><option value="grant">Grant</option></select></label>
        <label>Countries (comma-separated, or Global)<input v-model="f.countries" placeholder="Nigeria, Ghana, Kenya"></label>
        <div class="w"><span>Stages</span><div class="ck"><label v-for="[k, l] in STAGES" :key="k"><input v-model="f.stages" type="checkbox" :value="k"> {{ l }}</label></div></div>
        <label>Sectors (comma-separated, blank for any)<input v-model="f.sectors" placeholder="Fintech, SaaS, Telecoms"></label>
        <label>Cheque from<input v-model="f.ticket_min" inputmode="decimal"></label><label>Cheque up to<input v-model="f.ticket_max" inputmode="decimal"></label>
        <label>Currency<select v-model="f.currency"><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option><option>KES</option></select></label>
        <label>Website<input v-model="f.link" placeholder="https://"></label>
        <label class="w">What they look for<textarea v-model="f.criteria" rows="3" maxlength="2000" /></label>
        <label>Source of these details<input v-model="f.source" maxlength="200" placeholder="Their website, checked on…"></label>
        <div class="w ck"><label><input v-model="f.verified" type="checkbox"> Verified: details checked, shown to founders</label><label><input v-model="f.affiliate" type="checkbox"> Aidi affiliate</label><label><input v-model="f.active" type="checkbox"> Active</label></div>
        <p v-if="msg" class="error w">{{ msg }}</p>
      </div>
      <template #foot><button v-if="f.id" class="btn secondary" :disabled="busy" @click="save(true)">Remove</button><span class="sp" /><button class="btn secondary" @click="f.open = false">Cancel</button><button class="btn" :disabled="busy || f.name.trim().length < 2" @click="save()">{{ busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.cp { display: flex; flex-direction: column; gap: 16px; } .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 680px; } .fx-stats { margin: 0; }
.tb { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .tb input { font: inherit; font-size: 13.5px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); min-width: 240px; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { font: inherit; font-size: 13px; padding: 7px 14px; background: #fff; border: 0; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 1px solid var(--c-rule-strong); } .seg button.on { background: var(--c-navy); color: #fff; }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: 13px; } th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } td { padding: 8px 10px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
td small { display: block; color: var(--c-muted); font-size: 12px; } .chip { margin-left: 6px; font-size: 11px; padding: 1px 6px; background: var(--c-signal-soft); color: var(--c-blue-deep); }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .pad { padding: 14px; }
.rl { padding: 16px; } .rl h2 { margin: 0 0 4px; font-size: 17px; } .rl table { margin-top: 12px; } .rl td input { width: 110px; font: inherit; font-size: 13px; padding: 5px 7px; border: 1px solid var(--c-rule-strong); }
.ws { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px; } .ws h3 { margin: 0 0 8px; font-size: 14px; } .ws label { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; padding: 4px 0; } .ws input { width: 80px; font: inherit; font-size: 13px; padding: 5px 7px; border: 1px solid var(--c-rule-strong); }
.row { display: flex; gap: 12px; align-items: center; margin-top: 14px; }
.frm { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .frm label, .frm .w > span { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } .frm .w { grid-column: 1 / -1; }
.frm input:not([type="checkbox"]), .frm select, .frm textarea { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; }
.ck { display: flex; gap: 14px; flex-wrap: wrap; } .ck label { flex-direction: row; align-items: center; gap: 6px; } .sp { flex: 1; }
@media (max-width: 760px) { .frm, .ws { grid-template-columns: 1fr; } }
</style>
