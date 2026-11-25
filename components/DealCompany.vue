<script setup lang="ts">
// The company card on a pipeline deal: what it does, where, founders, the round and traction. Facts AI filled carry an
// AI mark until someone checks them. "Update with AI" looks the company up again and shows what's new or different,
// field by field, to accept or leave.
import { shortAmount } from '~/shared/compact'
interface Founder { name: string; role: string; linkedin: string }
type Deal = Record<string, unknown> & { id: string; company: string; founders: Founder[]; ai_unchecked: string[]; ai_sources: { title: string; url: string }[]; ai_looked_up_at: string | null }
const props = defineProps<{ deal: Deal; vehicles: { id: string; name: string }[] }>()
const emit = defineEmits<{ changed: [] }>()
const ROUND: Record<string, string> = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', later: 'Later' }
const LABEL: Record<string, string> = { company: 'Company', website: 'Website', one_liner: 'One-liner', description: 'About', sector: 'Sector', business_model: 'Business model', country: 'Country', city: 'City', founded: 'Founded', team_size: 'Team size', linkedin: 'LinkedIn page', founders: 'Founders', round: 'Round', raise_usd: 'Raising', valuation_usd: 'Post-money', lead_investor: 'Lead investor', investors: 'Backed by', traction: 'Traction' }
const d = computed(() => props.deal)
const un = computed(() => new Set(d.value.ai_unchecked ?? []))
const editing = ref(false), showSrc = ref(false)
const host = (u: unknown) => String(u ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
const show = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return ''
  if (k === 'founders') return (v as Founder[]).map((x) => x.name + (x.role ? ' (' + x.role + ')' : '')).join(', ')
  if (k === 'round') return ROUND[String(v)] ?? String(v)
  if (k === 'raise_usd' || k === 'valuation_usd') return shortAmount(String(v))
  return String(v)
}
const facts = computed(() => [['sector', 'Sector'], ['business_model', 'Model'], ['hq', 'Based in'], ['founded', 'Founded'], ['team_size', 'Team'], ['lead_investor', 'Lead investor'], ['investors', 'Backed by']]
  .map(([k, l]) => ({ k: k!, l: l!, v: k === 'hq' ? [d.value.city, d.value.country].filter(Boolean).join(', ') : show(k!, d.value[k!]), ai: k === 'hq' ? un.value.has('city') || un.value.has('country') : un.value.has(k!) })).filter((x) => x.v))
const links = computed(() => [['website', 'Website'], ['linkedin', 'LinkedIn'], ['deck_url', 'Deck']].filter(([k]) => d.value[k!]).map(([k, l]) => ({ k: k!, l: l!, u: String(d.value[k!]), ai: un.value.has(k!) })))
const empty = computed(() => !facts.value.length && !d.value.description && !(d.value.founders ?? []).length && !d.value.traction)

// Update with AI
const look = ref(false), busy = ref(false), msg = ref(''), found = ref<{ k: string; now: string; next: string; raw: unknown; on: boolean }[]>([]), srcs = ref<{ title: string; url: string }[]>([]), looked = ref(false)
const errOf = (e: unknown, x: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? x
async function update() {
  look.value = true; busy.value = true; msg.value = ''; found.value = []; looked.value = false
  try {
    const r = await $fetch<{ profile: Record<string, unknown>; sources: { title: string; url: string }[] }>('/api/pipeline/lookup', { method: 'POST', body: { query: String(d.value.website || d.value.company), except: d.value.id } })
    const same = (k: string, a: unknown, b: unknown) => (k === 'founders' ? JSON.stringify((a as Founder[] ?? []).map((x) => x.name.toLowerCase()).sort()) === JSON.stringify((b as Founder[]).map((x) => x.name.toLowerCase()).sort()) : k === 'website' || k === 'linkedin' ? host(a) === host(b) : String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase())
    found.value = Object.entries(r.profile).filter(([k, v]) => k !== 'company' && !same(k, d.value[k], v)).map(([k, v]) => { const now = show(k, d.value[k]); return { k, now, next: show(k, v), raw: v, on: !now } })
    srcs.value = r.sources; looked.value = true
  } catch (e) { msg.value = errOf(e, 'Could not look this company up just now.') } finally { busy.value = false }
}
async function apply() {
  const pick = found.value.filter((x) => x.on); if (!pick.length) { look.value = false; return }
  busy.value = true; msg.value = ''
  try {
    const body: Record<string, unknown> = { from_ai: pick.map((x) => x.k), sources: srcs.value }
    for (const x of pick) body[x.k] = x.k === 'founded' || x.k === 'raise_usd' || x.k === 'valuation_usd' ? Number(x.raw) : x.raw
    await $fetch('/api/pipeline/' + d.value.id, { method: 'PATCH', body }); look.value = false; emit('changed')
  } catch (e) { msg.value = errOf(e, 'Could not save.') } finally { busy.value = false }
}
const when = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
</script>

<template>
  <div class="card co">
    <div class="coh"><h2>Company</h2><span class="act"><button type="button" class="btn secondary sm" :disabled="busy" @click="update">Update with AI</button><button type="button" class="btn secondary sm" @click="editing = true">Edit</button></span></div>
    <p v-if="un.size" class="unc"><span><i class="ai">AI</i> {{ un.size }} detail{{ un.size === 1 ? '' : 's' }} came from AI and {{ un.size === 1 ? 'hasn\'t' : 'haven\'t' }} been checked.</span><button type="button" class="lnk" @click="editing = true">Review</button></p>
    <EmptyState v-if="empty" compact icon="pipeline" title="No company details yet" text="Add them yourself, or let AI look the company up."><button class="btn" :disabled="busy" @click="update">Fill in with AI</button></EmptyState>
    <template v-else>
      <div v-if="d.description" class="about"><i v-if="un.has('description')" class="ai abt">AI</i><RichView :md="String(d.description)" /></div>
      <dl class="facts"><div v-for="x in facts" :key="x.k"><dt>{{ x.l }}</dt><dd>{{ x.v }} <i v-if="x.ai" class="ai">AI</i></dd></div></dl>
      <div v-if="(d.founders ?? []).length" class="blk"><p class="sh">Founders <i v-if="un.has('founders')" class="ai">AI</i></p>
        <ul class="fo"><li v-for="p in d.founders" :key="p.name"><b>{{ p.name }}</b><span v-if="p.role">{{ p.role }}</span><a v-if="p.linkedin" :href="p.linkedin" target="_blank" rel="noopener">LinkedIn</a></li></ul></div>
      <div v-if="d.traction" class="blk"><p class="sh">Traction <i v-if="un.has('traction')" class="ai">AI</i></p><RichView :md="String(d.traction)" class="tr" /></div>
      <p v-if="links.length || d.referred_by" class="lks"><a v-for="x in links" :key="x.k" :href="x.u" target="_blank" rel="noopener">{{ x.l }} ↗</a><span v-if="d.referred_by" class="muted">Referred by {{ d.referred_by }}</span></p>
      <p v-if="d.ai_sources?.length" class="muted sm2">AI looked it up {{ when(d.ai_looked_up_at) }} · <button type="button" class="lnk" @click="showSrc = !showSrc">{{ showSrc ? 'hide' : d.ai_sources.length + ' source' + (d.ai_sources.length === 1 ? '' : 's') }}</button></p>
      <ul v-if="showSrc" class="src"><li v-for="s in d.ai_sources" :key="s.url"><a :href="s.url" target="_blank" rel="noopener">{{ s.title || s.url }}</a></li></ul>
    </template>
    <AddDealDialog :open="editing" :vehicles="vehicles" :deal="deal" @close="editing = false" @saved="emit('changed')" />
    <AppModal :open="look" title="Update with AI" wide @close="look = false">
      <p v-if="busy && !looked" class="muted">Searching the company site, news and funding announcements. This takes 20–40 seconds.</p>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
      <template v-if="looked">
        <p v-if="!found.length" class="muted">Nothing new: what AI found matches what you have.</p>
        <template v-else><p class="muted">Tick what to take. Empty fields are ticked; changes to what you already have are not.</p>
          <table class="df"><thead><tr><th /><th>Field</th><th>You have</th><th>AI found</th></tr></thead>
            <tbody><tr v-for="x in found" :key="x.k" :class="{ on: x.on }" @click="x.on = !x.on"><td><input v-model="x.on" type="checkbox" :aria-label="'Take ' + LABEL[x.k]" @click.stop></td><td>{{ LABEL[x.k] ?? x.k }}</td><td class="now">{{ x.now || '—' }}</td><td>{{ x.next }}</td></tr></tbody></table>
          <details v-if="srcs.length" class="sd"><summary>{{ srcs.length }} source{{ srcs.length === 1 ? '' : 's' }}</summary><ul class="src"><li v-for="s in srcs" :key="s.url"><a :href="s.url" target="_blank" rel="noopener">{{ s.title || s.url }}</a></li></ul></details>
        </template>
      </template>
      <template v-if="looked && found.length" #foot><button class="btn secondary" type="button" @click="look = false">Cancel</button><button class="btn" type="button" :disabled="busy || !found.some((x) => x.on)" @click="apply">Take {{ found.filter((x) => x.on).length }} change{{ found.filter((x) => x.on).length === 1 ? '' : 's' }}</button></template>
    </AppModal>
  </div>
</template>

<style scoped>
.co { display: flex; flex-direction: column; gap: 12px; } .coh { display: flex; justify-content: space-between; align-items: center; gap: 10px; } .coh h2 { margin: 0; } .act { display: flex; gap: 6px; } .sm { padding: 6px 12px; font-size: 13px; }
.ai { font-style: normal; font-size: 9.5px; font-weight: 600; letter-spacing: .06em; color: var(--c-blue-deep); background: #e6eef6; padding: 1px 5px; vertical-align: 1px; }
.unc { margin: 0; display: flex; justify-content: space-between; gap: 10px; background: #f2f6fb; border: 1px solid #d6e2ef; padding: 8px 12px; font-size: 13px; color: var(--c-ink-soft); }
.about { margin: 0; position: relative; } .about .abt { float: right; margin: 2px 0 6px 10px; }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px 18px; margin: 0; } .facts dt { font-size: 11.5px; color: var(--c-muted); } .facts dd { margin: 2px 0 0; color: var(--c-ink); }
.blk { border-top: 1px solid var(--c-rule); padding-top: 10px; } .sh { margin: 0 0 6px; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); display: flex; gap: 6px; align-items: center; }
.fo { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 22px; } .fo li { display: flex; gap: 8px; align-items: baseline; } .fo b { font-weight: 500; color: var(--c-navy); } .fo span { color: var(--c-muted); font-size: 13px; } .fo a, .lks a { color: var(--c-blue-deep); font-size: 13px; text-decoration: none; }
.tr { margin: 0; } .lks { margin: 0; display: flex; gap: 16px; flex-wrap: wrap; align-items: baseline; border-top: 1px solid var(--c-rule); padding-top: 10px; }
.muted { color: var(--c-muted); } .sm2 { font-size: 12.5px; margin: 0; } .lnk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .error { color: var(--c-danger); }
.src { margin: 0; padding-left: 18px; font-size: 13px; } .src a { color: var(--c-blue-deep); word-break: break-all; }
.df { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13.5px; } .df th { text-align: left; font-weight: 500; font-size: 11.5px; color: var(--c-muted); padding: 6px 8px; border-bottom: 1px solid var(--c-rule-strong); }
.df td { padding: 8px; border-bottom: 1px solid var(--c-rule); vertical-align: top; cursor: pointer; } .df td:first-child { width: 28px; } .df td:nth-child(2) { white-space: nowrap; color: var(--c-ink-soft); } .df .now { color: var(--c-muted); } .df tr.on td:last-child { color: var(--c-navy); } .df input { width: auto; }
.sd summary { cursor: pointer; color: var(--c-blue-deep); font-size: 13px; }
</style>
