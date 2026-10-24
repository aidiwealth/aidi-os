<script setup lang="ts">
// The details an annual report needs that only the founder knows: who the directors and CFO are, the registered
// office, accountants, bankers and advisers, and optional notes. Saved for next time; missing items are marked.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; saved: [missing: { key: string; label: string }[]] }>()
interface Adv { name: string; address: string }
interface Per { name: string; role: string }
interface P { legal_name: string; incorporated_on: string; jurisdiction: string; legal_form: string; principal_activities: string; framework: string; fye_month: number; directors: Per[]; secretary: string; cfo: Per; registered_office: string; other_offices: string; accountants: Adv[]; engagement: string; accountants_report: string; legal_counsel: Adv; tax_adviser: Adv; registered_agent: Adv; bankers: string[]; signatory: Per; approved_on: string; share_classes: { name: string; authorized: number | null; par: number | null }[]; notes: Record<string, string> }
const f = ref<P | null>(null); const missing = ref<{ key: string; label: string }[]>([]); const saved = ref(false)
const busy = ref(false); const msg = ref(''); const sec = ref('company')
async function load() { const r = await $fetch<{ profile: P; missing: { key: string; label: string }[]; saved: boolean; classes: string[] }>('/api/financials/report-profile'); f.value = JSON.parse(JSON.stringify(r.profile)); f.value!.share_classes ??= []; for (const c of r.classes ?? []) if (!f.value!.share_classes.some((x) => x.name.toLowerCase() === c.toLowerCase())) f.value!.share_classes.push({ name: c, authorized: null, par: null }); missing.value = r.missing; saved.value = r.saved; if (!f.value!.directors.length) f.value!.directors.push({ name: '', role: 'Director' }); if (!f.value!.bankers.length) f.value!.bankers.push(''); if (!f.value!.accountants.length) f.value!.accountants.push({ name: '', address: '' }) }
watch(() => props.open, (o) => { if (o) { msg.value = ''; void load() } }, { immediate: true })
// Still missing: on the saved list and still empty here (filled by hand or by AI, the mark goes).
const filled = (k: string) => { const v = (f.value as unknown as Record<string, unknown> | null)?.[k]; if (Array.isArray(v)) return v.some((x) => (typeof x === 'string' ? x.trim() : (x as { name?: string })?.name?.trim())); if (v && typeof v === 'object') return !!String((v as { name?: string }).name ?? '').trim(); return !!String(v ?? '').trim() }
const stillMissing = computed(() => missing.value.filter((m) => !filled(m.key)))
const miss = (k: string) => missing.value.some((m) => m.key === k) && !filled(k)
async function save() {
  if (!f.value) return
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ missing: { key: string; label: string }[] }>('/api/financials/report-profile', { method: 'POST', body: { ...f.value, share_classes: f.value.share_classes.map((c) => ({ name: c.name, authorized: typeof c.authorized === 'number' ? c.authorized : null, par: typeof c.par === 'number' ? c.par : null })) } }); missing.value = r.missing; emit('saved', r.missing); emit('close') }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
// Fill with AI: suggestions for the empty details from the account (and the web when ticked), each with its source.
// Only empty fields are filled; nothing is saved until "Save details".
const KL: Record<string, string> = { legal_form: 'Legal form', jurisdiction: 'Incorporated in', incorporated_on: 'Date of incorporation', principal_activities: 'Principal activities', registered_office: 'Registered office', other_offices: 'Other offices', directors: 'Directors', secretary: 'Company secretary', cfo: 'Chief Financial Officer', signatory: 'Signs for the board', bankers: 'Principal bankers', legal_counsel: 'Legal counsel', registered_agent: 'Registered agent', tax_adviser: 'Tax advisers' }
const KS: Record<string, string> = { legal_form: 'company', jurisdiction: 'company', incorporated_on: 'company', principal_activities: 'company', directors: 'people', secretary: 'people', cfo: 'people', signatory: 'people', registered_office: 'advisers', other_offices: 'advisers', bankers: 'advisers', legal_counsel: 'advisers', registered_agent: 'advisers', tax_adviser: 'advisers' }
const ai = reactive({ web: true, busy: false, msg: '', got: [] as { key: string; value: string; source: string }[], searched: false })
const sug = (k: string) => ai.got.find((x) => x.key === k) ?? null
const two = (v: string) => { const [a, b] = v.split('|').map((x) => x.trim()); return [a ?? '', b ?? ''] as const }
function apply(k: string, v: string) {
  const p = f.value as unknown as Record<string, unknown>
  if (k === 'directors') { (f.value!.directors as Per[]) = v.split('\n').map((l) => two(l)).filter(([n]) => n).map(([name, role]) => ({ name, role: role || 'Director' })); return }
  if (k === 'cfo' || k === 'signatory') { const [name, role] = two(v); (p[k] as Per).name = name; if (role) (p[k] as Per).role = role; return }
  if (k === 'bankers') { (f.value!.bankers as string[]) = v.split('\n').map((x) => x.trim()).filter(Boolean); return }
  if (k === 'legal_counsel' || k === 'registered_agent' || k === 'tax_adviser') { const [name, address] = two(v); (p[k] as Adv).name = name; (p[k] as Adv).address = address; return }
  p[k] = v
}
async function fillAi() {
  if (!f.value) return
  ai.busy = true; ai.msg = ''
  try {
    const r = await $fetch<{ fields: { key: string; value: string; source: string }[]; searched: boolean }>('/api/financials/report-suggest', { method: 'POST', body: { web: ai.web } })
    for (const x of r.fields) apply(x.key, x.value)
    ai.got = r.fields; ai.searched = r.searched
    ai.msg = r.fields.length ? '' : 'Nothing more could be found' + (ai.web ? ' in your account or online' : ' in your account') + '. Fill the rest in yourself.'
    const first = r.fields[0]; if (first) sec.value = KS[first.key] ?? sec.value
  } catch (e) { ai.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not fill this in just now.' } finally { ai.busy = false }
}
const isUrl = (s: string) => /^https?:\/\//.test(s)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SECS = [['company', 'Company'], ['people', 'Directors & officers'], ['advisers', 'Offices, advisers & bankers'], ['accounts', 'Accountants'], ['notes', 'Notes (optional)']] as const
const secMiss = (s: string) => ({ company: ['legal_name', 'incorporated_on', 'jurisdiction', 'principal_activities'], people: ['directors', 'cfo', 'signatory'], advisers: ['registered_office', 'bankers'], accounts: ['accountants', 'accountants_report'], notes: [] as string[] } as Record<string, string[]>)[s]!.filter(miss).length
</script>

<template>
  <AppModal :open="open" title="Report details" wide @close="emit('close')">
    <div v-if="f" class="rd">
      <p class="hint">Saved for next time.{{ saved ? '' : ' Pre-filled from your settings; please check.' }}</p>
      <div v-if="stillMissing.length" class="need"><b>{{ stillMissing.length }} to fill in:</b> {{ stillMissing.map((m) => m.label).join(', ') }}. Empty items are left out.</div>
      <div class="aif"><div class="ait"><AiSpark :size="18" /><span><b>Fill the empty details with AI</b><em>From your account{{ ai.web ? ' and online' : '' }}. Only empty fields are filled; check them.</em></span></div>
        <label class="wb"><input v-model="ai.web" type="checkbox"> Also search online</label>
        <button type="button" class="btn sm" :disabled="ai.busy" @click="fillAi"><AiSpark v-if="ai.busy" :size="14" /> {{ ai.busy ? (ai.web ? 'Searching…' : 'Reading…') : 'Fill with AI' }}</button></div>
      <AiThinking v-if="ai.busy" compact :steps="ai.web ? ['Reading your account…', 'Searching your website…', 'Checking company registries…', 'Matching what was found…'] : ['Reading your account…', 'Matching what was found…']" />
      <p v-if="ai.msg" class="hint">{{ ai.msg }}</p>
      <div v-if="ai.got.length" class="aig"><b>Filled by AI: check each before saving{{ ai.web && !ai.searched ? ' (online search was not available, so from your account only)' : '' }}</b>
        <ul><li v-for="x in ai.got" :key="x.key"><button type="button" class="link" @click="sec = KS[x.key] ?? sec">{{ KL[x.key] ?? x.key }}</button><span class="sv">{{ x.value.replace(/\n/g, '; ').replace(/ \| /g, ', ') }}</span><a v-if="isUrl(x.source)" :href="x.source" target="_blank" rel="noopener" class="src">source</a><em v-else-if="x.source" class="src">{{ x.source }}</em></li></ul></div>
      <nav class="tabs"><button v-for="[k, l] in SECS" :key="k" type="button" :class="{ on: sec === k }" @click="sec = k">{{ l }}<em v-if="secMiss(k)">{{ secMiss(k) }}</em></button></nav>

      <div v-show="sec === 'company'" class="g2">
        <label class="label" :class="{ m: miss('legal_name') }">Legal name<input v-model="f.legal_name" maxlength="200"></label>
        <label class="label">Legal form<input v-model="f.legal_form" maxlength="120" placeholder="e.g. Delaware corporation, private limited company"></label>
        <label class="label" :class="{ m: miss('incorporated_on') }">Date of incorporation<input v-model="f.incorporated_on" type="date"></label>
        <label class="label" :class="{ m: miss('jurisdiction') }">Incorporated in<input v-model="f.jurisdiction" maxlength="200" placeholder="e.g. Delaware, United States"></label>
        <label class="label wide" :class="{ m: miss('principal_activities') }">Principal activities<textarea v-model="f.principal_activities" rows="3" maxlength="2000" placeholder="What the company does, for whom and where" /></label>
        <label class="label">Accounting framework<select v-model="f.framework"><option value="us_gaap">US GAAP</option><option value="ifrs">IFRS</option><option value="ifrs_sme">IFRS for SMEs</option></select></label>
        <div v-if="f.share_classes.length" class="label wide">Authorised shares (for the shareholding table)
          <div v-for="c in f.share_classes" :key="c.name" class="sc"><span>{{ c.name }}</span><input v-model.number="c.authorized" type="number" min="0" step="1" placeholder="Authorised shares"><input v-model.number="c.par" type="number" min="0" step="any" placeholder="Par value per share"></div></div>
        <label class="label">Financial year ends in<select v-model.number="f.fye_month"><option v-for="(m, i) in MONTHS" :key="m" :value="i + 1">{{ m }}</option></select></label>
      </div>

      <div v-show="sec === 'people'" class="g1">
        <div class="label" :class="{ m: miss('directors') }">Directors who served during the year
          <div v-for="(d, i) in f.directors" :key="i" class="pr"><input v-model="d.name" placeholder="Full name" maxlength="200"><input v-model="d.role" placeholder="e.g. Director, Chief Executive Officer" maxlength="120"><button type="button" class="x" aria-label="Remove" @click="f.directors.splice(i, 1)">×</button></div>
          <button type="button" class="link" @click="f.directors.push({ name: '', role: 'Director' })">+ Add a director</button></div>
        <div class="g2">
          <label class="label" :class="{ m: miss('cfo') }">Chief Financial Officer (or who reviewed the figures)<input v-model="f.cfo.name" placeholder="Full name" maxlength="200"></label>
          <label class="label">Their title<input v-model="f.cfo.role" maxlength="120" placeholder="Chief Financial Officer"></label>
          <label class="label">Company secretary or board counsel<input v-model="f.secretary" maxlength="200"></label>
          <span />
          <label class="label" :class="{ m: miss('signatory') }">Signs for the board<input v-model="f.signatory.name" placeholder="Full name" maxlength="200"></label>
          <label class="label">Their title<input v-model="f.signatory.role" maxlength="120" placeholder="Director, Secretary"></label>
          <label class="label">Date the board approved the statements<input v-model="f.approved_on" type="date"></label>
        </div>
      </div>

      <div v-show="sec === 'advisers'" class="g2">
        <label class="label" :class="{ m: miss('registered_office') }">Registered office<textarea v-model="f.registered_office" rows="3" maxlength="600" placeholder="Street, city, state or country" /></label>
        <label class="label">Other offices<textarea v-model="f.other_offices" rows="3" maxlength="1200" placeholder="One per line" /></label>
        <div class="label wide" :class="{ m: miss('bankers') }">Principal bankers
          <div v-for="(b, i) in f.bankers" :key="i" class="pr"><input v-model="f.bankers[i]" placeholder="e.g. JPMorgan Chase Bank, N.A." maxlength="200"><button type="button" class="x" aria-label="Remove" @click="f.bankers.splice(i, 1)">×</button></div>
          <button type="button" class="link" @click="f.bankers.push('')">+ Add a bank</button></div>
        <label class="label">Legal counsel<input v-model="f.legal_counsel.name" maxlength="200"><textarea v-model="f.legal_counsel.address" rows="2" maxlength="600" placeholder="Address (optional)" /></label>
        <label class="label">Tax advisers<input v-model="f.tax_adviser.name" maxlength="200"><textarea v-model="f.tax_adviser.address" rows="2" maxlength="600" placeholder="Address (optional)" /></label>
        <label class="label">Registered agent<input v-model="f.registered_agent.name" maxlength="200"><textarea v-model="f.registered_agent.address" rows="2" maxlength="600" placeholder="Address (optional)" /></label>
      </div>

      <div v-show="sec === 'accounts'" class="g1">
        <label class="label">Who prepared the statements<select v-model="f.engagement"><option value="none">Management (not reviewed or audited)</option><option value="compiled">Compiled by accountants</option><option value="reviewed">Reviewed by independent accountants</option><option value="audited">Audited</option></select></label>
        <div v-if="f.engagement !== 'none'" class="label" :class="{ m: miss('accountants') }">{{ f.engagement === 'audited' ? 'Auditors' : 'Accountants' }}
          <div v-for="(a, i) in f.accountants" :key="i" class="ac"><input v-model="a.name" placeholder="Firm name" maxlength="200"><textarea v-model="a.address" rows="2" maxlength="600" placeholder="Address" /><button type="button" class="x" aria-label="Remove" @click="f.accountants.splice(i, 1)">×</button></div>
          <button v-if="f.accountants.length < 4" type="button" class="link" @click="f.accountants.push({ name: '', address: '' })">+ Add a firm (e.g. one per country)</button></div>
        <label v-if="f.engagement === 'reviewed' || f.engagement === 'audited'" class="label" :class="{ m: miss('accountants_report') }">{{ f.engagement === 'audited' ? 'The auditors\' report' : 'The accountants\' review report' }}, in their words
          <textarea v-model="f.accountants_report" rows="7" maxlength="20000" placeholder="Paste the signed report from your accountants. Finvry never writes an opinion for them." /></label>
      </div>

      <div v-show="sec === 'notes'" class="g1">
        <p class="hint">Optional notes after the statements.</p>
        <label class="label">Going concern and management's plans<textarea v-model="f.notes.going_concern" rows="2" maxlength="4000" placeholder="e.g. plans to raise further equity to fund growth" /></label>
        <label class="label">Property and equipment<textarea v-model="f.notes.property" rows="2" maxlength="4000" placeholder="Main items, cost, depreciation for the year" /></label>
        <label class="label">Leases<textarea v-model="f.notes.leases" rows="2" maxlength="4000" placeholder="Offices leased, terms and rent for the year" /></label>
        <label class="label">Retirement plan<textarea v-model="f.notes.retirement" rows="2" maxlength="4000" /></label>
        <label class="label">Related party transactions<textarea v-model="f.notes.related_parties" rows="2" maxlength="4000" /></label>
        <label class="label">Events after the year end<textarea v-model="f.notes.subsequent_events" rows="2" maxlength="4000" /></label>
        <label class="label">Other information<textarea v-model="f.notes.other" rows="2" maxlength="6000" /></label>
      </div>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <p v-else class="hint">Loading…</p>
    <template #foot><button class="btn secondary" type="button" @click="emit('close')">Cancel</button><button class="btn" type="button" :disabled="busy || !f" @click="save">Save details</button></template>
  </AppModal>
</template>

<style scoped>
.rd { display: flex; flex-direction: column; gap: 12px; font-size: 14px; }
.hint { color: var(--c-muted); font-size: 12.5px; margin: 0; }
.need { background: #fff8eb; border: 1px solid #f0d9a8; padding: 10px 14px; font-size: 13px; color: #6b4a07; }
.tabs { display: flex; gap: 18px; border-bottom: 1px solid var(--c-rule); flex-wrap: wrap; } .tabs button { background: none; border: 0; padding: 8px 0; font: inherit; font-size: 13.5px; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.tabs em { font-style: normal; font-size: 11px; background: #c98a1c; color: #fff; padding: 0 6px; margin-left: 5px; }
.g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; } .g1 { display: flex; flex-direction: column; gap: 12px; } .wide { grid-column: 1 / -1; }
.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.label.m > input, .label.m > textarea, .label.m .pr input:first-child, .label.m .ac input { border-color: #d39b2a; background: #fffdf7; }
.label.m::before { content: 'Needs filling'; order: 2; font-size: 11px; color: #a5650b; }
input, select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); width: 100%; box-sizing: border-box; }
.pr { display: grid; grid-template-columns: 1fr 1fr 28px; gap: 8px; } .ac { display: grid; grid-template-columns: 1fr 1.4fr 28px; gap: 8px; align-items: start; }
.label.wide .pr { grid-template-columns: 1fr 28px; }
.sc { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 8px; align-items: center; } .sc span { font-size: 13.5px; }
.x { background: none; border: 1px solid var(--c-rule); cursor: pointer; font-size: 16px; color: var(--c-muted); height: 36px; }
.link { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; align-self: flex-start; }
.error { color: var(--c-danger); margin: 0; }
@media (max-width: 700px) { .g2 { grid-template-columns: 1fr; } }
.aif { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; border: 1px solid var(--c-rule-strong); background: var(--c-paper-3); padding: 12px 14px; margin: 0 0 10px; }
.ait { display: flex; gap: 10px; align-items: flex-start; flex: 1; min-width: 260px; color: var(--c-navy); } .ait span { display: flex; flex-direction: column; gap: 2px; } .ait b { font-size: 14px; font-weight: 500; } .ait em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.wb { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--c-ink-soft); white-space: nowrap; } .aif .btn { display: inline-flex; align-items: center; gap: 6px; }
.aig { border: 1px solid #c9d6ec; background: #f4f7fc; padding: 10px 14px; margin: 0 0 10px; font-size: 13px; } .aig b { font-weight: 500; color: var(--c-navy); } .aig ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.aig li { display: grid; grid-template-columns: 170px 1fr auto; gap: 10px; align-items: baseline; } .aig .sv { color: var(--c-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .aig .src { font-style: normal; font-size: 12px; color: var(--c-muted); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .aig a.src { color: var(--c-blue-deep); }
@media (max-width: 700px) { .aig li { grid-template-columns: 1fr; } }
.aig li .link { text-align: left; }
</style>
