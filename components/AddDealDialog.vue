<script setup lang="ts">
// Add a deal to the pipeline. Start from the website or name: AI looks the company up online and fills in what it
// finds; every field it filled is marked until someone checks or edits it, and the pages it used are listed. Nothing
// is saved until "Add to pipeline". With a deal passed in, the same form edits that deal's company details.
const props = defineProps<{ open: boolean; vehicles: { id: string; name: string }[]; deal?: Record<string, unknown> | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const editing = computed(() => !!props.deal)
const ROUND: Record<string, string> = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', later: 'Later' }
const MODEL = ['B2B', 'B2C', 'B2B2C', 'Marketplace', 'Infrastructure / API', 'Hardware', 'Other']
interface Founder { name: string; role: string; linkedin: string }
const blank = () => ({ company: '', website: '', one_liner: '', description: '', sector: '', country: '', city: '', founded: '', business_model: '', team_size: '', linkedin: '',
  founders: [] as Founder[], round: '', raise_usd: '', valuation_usd: '', lead_investor: '', investors: '', traction: '', deck_url: '',
  source: 'referral', referred_by: '', vehicle_entity_id: '', stage: 'screening' })
const f = reactive(blank())
type Key = keyof ReturnType<typeof blank>
const ai = ref(new Set<string>()), sources = ref<{ title: string; url: string }[]>([]), showSrc = ref(false)
const q = ref(''), looking = ref(false), looked = ref(false), msg = ref(''), busy = ref(false), dup = ref<{ id: string; company: string; stage: string } | null>(null)
const isAi = (k: Key) => ai.value.has(k)
const touched = (k: Key) => { if (ai.value.has(k)) { const s = new Set(ai.value); s.delete(k); ai.value = s } }
const errOf = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? d
watch(() => props.open, (o) => {
  if (!o) return
  Object.assign(f, blank()); ai.value = new Set(); sources.value = []; q.value = ''; looked.value = false; msg.value = ''; dup.value = null; showSrc.value = false
  const d = props.deal; if (!d) return
  for (const k of Object.keys(f) as Key[]) { const v = d[k]; if (k === 'founders') f.founders = Array.isArray(v) ? (v as Founder[]).map((x) => ({ name: x.name ?? '', role: x.role ?? '', linkedin: x.linkedin ?? '' })) : []; else if (v !== null && v !== undefined) (f as Record<string, unknown>)[k] = String(v) }
  ai.value = new Set((d.ai_unchecked as string[] | undefined) ?? []); sources.value = (d.ai_sources as { title: string; url: string }[] | undefined) ?? []; looked.value = true
}, { immediate: true })

async function lookup() {
  const v = q.value.trim(); if (!v) return
  looking.value = true; msg.value = ''
  try {
    const r = await $fetch<{ profile: Partial<Record<Key, unknown>>; sources: { title: string; url: string }[]; duplicate: { id: string; company: string; stage: string } | null }>('/api/pipeline/lookup', { method: 'POST', body: { query: v } })
    const filled = new Set<string>()
    for (const [k, val] of Object.entries(r.profile)) {
      if (val === null || val === undefined || val === '' || (Array.isArray(val) && !val.length)) continue
      ;(f as Record<string, unknown>)[k] = Array.isArray(val) ? val.map((x) => ({ ...x })) : String(val); filled.add(k)
    }
    if (!f.company) f.company = /\./.test(v) ? '' : v
    if (!f.website && /\./.test(v)) f.website = v
    ai.value = filled; sources.value = r.sources; dup.value = r.duplicate; looked.value = true
  } catch (e) { msg.value = errOf(e, 'Could not look this company up. Fill it in yourself.'); looked.value = true; if (!f.company && !/\./.test(v)) f.company = v; if (!f.website && /\./.test(v)) f.website = v }
  finally { looking.value = false }
}
function manual() { looked.value = true; const v = q.value.trim(); if (/\./.test(v)) f.website = v; else f.company = v }
const addFounder = () => f.founders.push({ name: '', role: '', linkedin: '' })
async function save() {
  busy.value = true; msg.value = ''
  try {
    const num = (s: string) => s.replace(/[^0-9]/g, '') || undefined
    if (editing.value) {
      const n = (s: string) => (s.replace(/[^0-9]/g, '') ? Number(s.replace(/[^0-9]/g, '')) : null)
      const { source: _s, stage: _st, vehicle_entity_id: _v, referred_by: _r, ...rest } = f
      await $fetch('/api/pipeline/' + props.deal!.id, { method: 'PATCH', body: { ...rest, round: f.round || null, raise_usd: n(f.raise_usd), valuation_usd: n(f.valuation_usd), founded: n(f.founded), founders: f.founders.filter((x) => x.name.trim()), from_ai: [...ai.value] } })
      emit('saved'); emit('close'); return
    }
    const r = await $fetch<{ id: string }>('/api/pipeline', { method: 'POST', body: { ...f, round: f.round || undefined, raise_usd: num(f.raise_usd), valuation_usd: num(f.valuation_usd), founded: num(f.founded),
      founders: f.founders.filter((x) => x.name.trim()), ai_unchecked: [...ai.value], sources: sources.value } })
    await navigateTo('/pipeline/' + r.id)
  } catch (e) { msg.value = errOf(e, 'Could not add the deal.') } finally { busy.value = false }
}
</script>

<template>
  <AppModal :open="open" :title="editing ? 'Company details' : 'Add a deal'" wide @close="emit('close')">
    <div v-if="!editing" class="lk">
      <label class="label" for="dq">Company website or name</label>
      <form class="lkrow" @submit.prevent="lookup"><input id="dq" v-model="q" placeholder="e.g. termii.com" maxlength="300" :disabled="looking"><button class="btn" :disabled="looking || !q.trim()">{{ looking ? 'Looking it up…' : 'Fill in with AI' }}</button></form>
      <p class="muted">AI searches the web for the company, founders and funding, and fills in what it finds. You check it before anything is saved.<template v-if="!looked"> Or <button type="button" class="lnk" @click="manual">fill it in yourself</button>.</template></p>
    </div>
    <p v-if="looking && !editing" class="wait">Searching the company site, news and funding databases. This takes 20–40 seconds.</p>

    <form v-if="looked" class="df" @submit.prevent="save">
      <div v-if="ai.size || sources.length" class="note"><span><b>{{ ai.size }} field{{ ai.size === 1 ? '' : 's' }} filled by AI{{ editing ? ', not checked yet' : '' }}.</b> Fields marked <i class="ai">AI</i> haven't been checked; editing one clears the mark.</span>
        <button v-if="sources.length" type="button" class="lnk" @click="showSrc = !showSrc">{{ showSrc ? 'Hide' : 'Show' }} {{ sources.length }} source{{ sources.length === 1 ? '' : 's' }}</button></div>
      <ul v-if="showSrc" class="src"><li v-for="s in sources" :key="s.url"><a :href="s.url" target="_blank" rel="noopener">{{ s.title || s.url }}</a></li></ul>
      <p v-if="dup" class="dupe">{{ dup.company }} is already in your pipeline ({{ dup.stage.replace('_', ' ') }}). <NuxtLink :to="'/pipeline/' + dup.id">Open it</NuxtLink> instead?</p>

      <h3>Company</h3>
      <div class="g2">
        <label class="label"><span class="lt">Company <i v-if="isAi('company')" class="ai">AI</i></span><input v-model="f.company" required maxlength="200" @input="touched('company')"></label>
        <label class="label"><span class="lt">Website <i v-if="isAi('website')" class="ai">AI</i></span><input v-model="f.website" maxlength="500" placeholder="https://" @input="touched('website')"></label>
        <label class="label full"><span class="lt">One-liner <i v-if="isAi('one_liner')" class="ai">AI</i></span><input v-model="f.one_liner" maxlength="300" placeholder="What they do, in one sentence" @input="touched('one_liner')"></label>
        <label class="label full"><span class="lt">About <i v-if="isAi('description')" class="ai">AI</i></span><textarea v-model="f.description" rows="3" maxlength="3000" placeholder="Product, customers, how they make money" @input="touched('description')" /></label>
      </div>
      <div class="g4">
        <label class="label"><span class="lt">Sector <i v-if="isAi('sector')" class="ai">AI</i></span><input v-model="f.sector" maxlength="100" placeholder="Fintech" @input="touched('sector')"></label>
        <label class="label"><span class="lt">Business model <i v-if="isAi('business_model')" class="ai">AI</i></span><select v-model="f.business_model" @change="touched('business_model')"><option value="">—</option><option v-for="m in MODEL" :key="m">{{ m }}</option></select></label>
        <label class="label"><span class="lt">Country <i v-if="isAi('country')" class="ai">AI</i></span><input v-model="f.country" maxlength="100" @input="touched('country')"></label>
        <label class="label"><span class="lt">City <i v-if="isAi('city')" class="ai">AI</i></span><input v-model="f.city" maxlength="100" @input="touched('city')"></label>
        <label class="label"><span class="lt">Founded <i v-if="isAi('founded')" class="ai">AI</i></span><input v-model="f.founded" inputmode="numeric" maxlength="4" placeholder="2019" @input="touched('founded')"></label>
        <label class="label"><span class="lt">Team size <i v-if="isAi('team_size')" class="ai">AI</i></span><input v-model="f.team_size" maxlength="40" placeholder="11–50" @input="touched('team_size')"></label>
        <label class="label sp2"><span class="lt">LinkedIn page <i v-if="isAi('linkedin')" class="ai">AI</i></span><input v-model="f.linkedin" maxlength="500" placeholder="https://linkedin.com/company/…" @input="touched('linkedin')"></label>
      </div>

      <h3>Founders <i v-if="isAi('founders')" class="ai">AI</i></h3>
      <div class="fl">
        <div v-for="(p, i) in f.founders" :key="i" class="fr"><input v-model="p.name" placeholder="Name" maxlength="120" @input="touched('founders')"><input v-model="p.role" placeholder="Role" maxlength="80" @input="touched('founders')"><input v-model="p.linkedin" placeholder="LinkedIn" maxlength="500" @input="touched('founders')"><button type="button" class="rm" :aria-label="'Remove ' + (p.name || 'founder')" @click="f.founders.splice(i, 1); touched('founders')">×</button></div>
        <button type="button" class="lnk" @click="addFounder">+ Add a founder</button>
      </div>

      <h3>The round</h3>
      <div class="g4">
        <label class="label"><span class="lt">Round <i v-if="isAi('round')" class="ai">AI</i></span><select v-model="f.round" @change="touched('round')"><option value="">—</option><option v-for="(l, k) in ROUND" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label"><span class="lt">Raising (USD) <i v-if="isAi('raise_usd')" class="ai">AI</i></span><input v-model="f.raise_usd" inputmode="numeric" @input="touched('raise_usd')"></label>
        <label class="label"><span class="lt">Post-money (USD) <i v-if="isAi('valuation_usd')" class="ai">AI</i></span><input v-model="f.valuation_usd" inputmode="numeric" @input="touched('valuation_usd')"></label>
        <label class="label"><span class="lt">Lead investor <i v-if="isAi('lead_investor')" class="ai">AI</i></span><input v-model="f.lead_investor" maxlength="200" @input="touched('lead_investor')"></label>
        <label class="label sp2"><span class="lt">Backed by <i v-if="isAi('investors')" class="ai">AI</i></span><input v-model="f.investors" maxlength="1000" placeholder="Earlier investors" @input="touched('investors')"></label>
        <label class="label sp2">Deck link<input v-model="f.deck_url" maxlength="1000" placeholder="https://"></label>
        <label class="label full4"><span class="lt">Traction <i v-if="isAi('traction')" class="ai">AI</i></span><textarea v-model="f.traction" rows="2" maxlength="2000" placeholder="Revenue, users, growth, key customers" @input="touched('traction')" /></label>
      </div>

      <template v-if="!editing"><h3>On our side</h3>
      <div class="g4">
        <label class="label">Source<select v-model="f.source"><option value="referral">Referral</option><option value="network">Network</option><option value="outbound">Outbound</option><option value="other">Other</option></select></label>
        <label v-if="f.source === 'referral'" class="label">Referred by<input v-model="f.referred_by" maxlength="200"></label>
        <label class="label"><span>Vehicle · <NuxtLink to="/settings#vehicles" class="mng">manage</NuxtLink></span><select v-model="f.vehicle_entity_id"><option value="">Default vehicle</option><option v-for="v in vehicles" :key="v.id" :value="v.id">{{ v.name }}</option></select></label>
        <label class="label">Start at<select v-model="f.stage"><option value="screening">Screening</option><option value="first_call">First call</option><option value="diligence">Diligence</option></select></label>
      </div></template>
      <div class="ft"><p v-if="msg" class="error" role="alert">{{ msg }}</p><span v-else class="muted">{{ ai.size ? ai.size + ' AI field' + (ai.size === 1 ? '' : 's') + ' not checked yet. They stay marked on the deal.' : '' }}</span><span class="fb"><button v-if="editing && ai.size" type="button" class="btn secondary" :disabled="busy" @click="ai = new Set()">Mark all as checked</button><button class="btn" type="submit" :disabled="busy">{{ busy ? 'Saving…' : editing ? 'Save' : 'Add to pipeline' }}</button></span></div>
    </form>
    <p v-else-if="msg" class="error" role="alert">{{ msg }}</p>
  </AppModal>
</template>

<style scoped>
.lk { background: var(--c-paper); border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.lkrow { display: flex; gap: 8px; } .lkrow input { flex: 1; } .muted { color: var(--c-muted); font-size: 13px; margin: 0; }
.lnk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.wait { margin: 14px 0 0; font-size: 13.5px; color: var(--c-ink-soft); }
.df { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
h3 { font-family: var(--font-body); font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); margin: 10px 0 0; padding-top: 12px; border-top: 1px solid var(--c-rule); display: flex; align-items: center; gap: 8px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; } .g4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 14px; }
.full { grid-column: 1 / -1; } .full4 { grid-column: 1 / -1; } .sp2 { grid-column: span 2; }
.label { display: flex; flex-direction: column; gap: 5px; } .lt { display: flex; align-items: center; gap: 6px; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; box-sizing: border-box; } textarea { resize: vertical; }
.ai { font-style: normal; font-size: 9.5px; font-weight: 600; letter-spacing: .06em; color: var(--c-blue-deep); background: #e6eef6; padding: 1px 5px; vertical-align: 1px; text-transform: none; }
.label:has(.ai) input, .label:has(.ai) select, .label:has(.ai) textarea { background: #f5f8fc; border-color: #b9cde3; }
.note { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; background: #f2f6fb; border: 1px solid #d6e2ef; padding: 10px 12px; font-size: 13px; color: var(--c-ink-soft); }
.src { margin: 0; padding: 8px 12px 8px 28px; border: 1px solid var(--c-rule); font-size: 13px; display: flex; flex-direction: column; gap: 3px; } .src a { color: var(--c-blue-deep); word-break: break-all; }
.dupe { margin: 0; background: #fff7ed; border: 1px solid #f3d6b3; padding: 9px 12px; font-size: 13px; }
.fl { display: flex; flex-direction: column; gap: 6px; } .fr { display: grid; grid-template-columns: 1.2fr 1fr 1.4fr auto; gap: 8px; }
.rm { background: none; border: 1px solid var(--c-rule); width: 34px; font-size: 18px; color: var(--c-muted); cursor: pointer; } .fl .lnk { align-self: flex-start; font-size: 13.5px; }
.ft { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; padding-top: 14px; border-top: 1px solid var(--c-rule); } .error { color: var(--c-danger); margin: 0; }
.mng { color: var(--c-blue-deep); text-decoration: none; } .fb { display: flex; gap: 8px; flex: none; }
@media (max-width: 720px) { .g2, .g4 { grid-template-columns: 1fr 1fr; } .sp2, .full4 { grid-column: 1 / -1; } .fr { grid-template-columns: 1fr 1fr; } }
</style>
