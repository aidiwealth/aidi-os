<script setup lang="ts">
// Exit planning on the cap table: worst / base / best exit values (revenue or ARR times a multiple, or a figure you
// enter) and what each holder would receive in each, using the cap table's own waterfall; and potential buyers found
// with AI (website, why they would buy, past deals, the contact route), worked as a short list.
import { exitByHolder, type Data } from '~/shared/captable'
const props = defineProps<{ data: Data; ct: string; hasShares: boolean }>()
interface Buyer { name: string; website: string; type: 'strategic' | 'financial'; why: string; fit: number; deals: string; price_note: string; contact: { name: string; title: string; email: string; linkedin: string; url: string }; sources: string[]; status: string; notes: string; found_at: string }
interface Plan { assumptions: { basis: 'arr' | 'revenue_ttm' | 'ebitda_ttm' | 'manual'; basis_value: number | null; currency: string; multiples: { worst: number; base: number; best: number }; rationale: string; years: number; growth: number | null; project: boolean; focus: string; about: string; ai_multiples?: { worst: number; base: number; best: number; basis: string; rationale: string } | null }
  buyers: Buyer[]; searched_at: string | null; search: { status: string; error: string | null; note: string | null }; basis: { arr: number | null; arr_source: string; revenue_ttm: number | null; ttm_source: string; ebitda_ttm: number | null; growth_pct: number | null; growth_source: string; latest: string | null; currency: string; reporting: string | null; fx: number | null; months: number; period: string | null; projected: { year: number; revenue: number }[] }; company: { name: string; about: string; website: string } }
const { data: plan, refresh } = await useFetch<Plan>('/api/equity/exit', { query: { ct: computed(() => props.ct) } })
const a = reactive({ basis: 'arr' as Plan['assumptions']['basis'], basis_value: null as number | null, currency: 'USD', worst: 2, base: 5, best: 10, rationale: '', focus: '', about: '', years: 3, growth: null as number | null, project: false })
watch(plan, (p) => { if (!p) return; const x = p.assumptions; Object.assign(a, { basis: x.basis, basis_value: x.basis_value, currency: x.currency || p.basis.currency, worst: x.multiples.worst, base: x.multiples.base, best: x.multiples.best, rationale: x.rationale, focus: x.focus, about: x.about || p.company.about, years: x.years || 3, growth: x.growth ?? null, project: !!x.project }) }, { immediate: true })
const today = new Date().toISOString().slice(0, 10)
const nowVal = computed(() => (a.basis === 'manual' ? Number(a.basis_value) || 0 : a.basis === 'arr' ? plan.value?.basis.arr ?? 0 : a.basis === 'ebitda_ttm' ? Math.max(0, plan.value?.basis.ebitda_ttm ?? 0) : plan.value?.basis.revenue_ttm ?? 0))
// At exit: today's figure grown for the years to exit (the founder's growth rate, or the one in their figures), or
// their own projection for that year when the financial model has one.
const exitYear = computed(() => new Date().getFullYear() + (Number(a.years) || 0))
const projFromModel = computed(() => (a.basis === 'revenue_ttm' || a.basis === 'arr' ? plan.value?.basis.projected.find((p) => p.year === exitYear.value)?.revenue ?? null : null))
// Empty growth: the rate in the founder's figures, held to 100% a year (a short history can show far more).
const growthUsed = computed(() => (a.growth !== null && (a.growth as unknown) !== '' ? Number(a.growth) || 0 : Math.min(100, plan.value?.basis.growth_pct ?? 0)))
const basisVal = computed(() => (!a.project || a.basis === 'manual' ? nowVal.value : projFromModel.value ?? Math.round(nowVal.value * Math.pow(1 + growthUsed.value / 100, Number(a.years) || 0))))
const basisNote = computed(() => { const b = plan.value?.basis; if (!b) return ''; const src = a.basis === 'arr' ? b.arr_source : a.basis === 'revenue_ttm' ? b.ttm_source : a.basis === 'ebitda_ttm' ? b.ttm_source : ''; return [src, b.reporting && b.reporting !== 'USD' ? 'converted from ' + b.reporting + ' to US dollars at today\'s rate' : ''].filter(Boolean).join(', ') })
const SC = [['worst', 'Worst case'], ['base', 'Base case'], ['best', 'Best case']] as const
const own = ref<number | ''>('')
const aiMore = ref(false)
const scen = computed(() => [...SC.map(([k, label]) => { const mult = Number(a[k]) || 0, value = Math.round(basisVal.value * mult); return { k: k as string, label: label as string, mult: mult as number | null, value, wf: value > 0 && props.hasShares ? exitByHolder(props.data, value, today) : null } }), ...(Number(own.value) > 0 ? [{ k: 'own', label: 'Your price', mult: null as number | null, value: Math.round(Number(own.value)), wf: props.hasShares ? exitByHolder(props.data, Math.round(Number(own.value)), today) : null }] : [])])
// Rows: the biggest holders in the base case, then everyone else together.
const rows = computed(() => {
  const base = scen.value[1]!.wf; if (!base) return []
  const names = base.rows.map((r) => r.holder)
  const top = names.slice(0, 10), rest = names.slice(10)
  const amt = (s: typeof scen.value[number], n: string[]) => (s.wf ? s.wf.rows.filter((r) => n.includes(r.holder)).reduce((t, r) => t + r.amount, 0) : 0)
  return [...top.map((n) => ({ name: n, how: base.rows.find((r) => r.holder === n)?.how ?? '', v: scen.value.map((s) => amt(s, [n])) })), ...(rest.length ? [{ name: 'Everyone else (' + rest.length + ')', how: '', v: scen.value.map((s) => amt(s, rest)) }] : [])]
})
const money = (v: number | null | undefined) => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: a.currency || 'USD', notation: Math.abs(v) >= 1e7 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(v) >= 1e7 ? 1 : 0 }).format(v))
const saving = ref(false), msg = ref('')
let tSave: ReturnType<typeof setTimeout> | undefined
function save(buyers?: Buyer[]) {
  clearTimeout(tSave)
  tSave = setTimeout(async () => {
    saving.value = true; msg.value = ''
    try { await $fetch('/api/equity/exit', { method: 'POST', body: { ct: props.ct, assumptions: { basis: a.basis, basis_value: a.basis === 'manual' ? Number(a.basis_value) || 0 : null, currency: a.currency || 'USD', multiples: { worst: Number(a.worst) || 0, base: Number(a.base) || 0, best: Number(a.best) || 0 }, rationale: a.rationale, years: Number(a.years) || 3, growth: a.growth === null || (a.growth as unknown) === '' ? null : Number(a.growth), project: a.project, focus: a.focus, about: a.about }, buyers } }) }
    catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { saving.value = false }
  }, buyers ? 0 : 700)
}
watch(() => [a.basis, a.basis_value, a.worst, a.base, a.best, a.years, a.growth, a.project], () => save())
function useAi() { const m = plan.value?.assumptions.ai_multiples; if (!m) return; Object.assign(a, { worst: m.worst, base: m.base, best: m.best, rationale: m.rationale, basis: m.basis === 'revenue_ttm' ? 'revenue_ttm' : 'arr' }) }
// Buyers: the AI search runs on the server; this follows it.
const searching = computed(() => plan.value?.search.status === 'running')
let poll: ReturnType<typeof setInterval> | undefined
watch(searching, (s) => { clearInterval(poll); if (s) poll = setInterval(() => refresh(), 4000) }, { immediate: true })
onBeforeUnmount(() => { clearInterval(poll); clearTimeout(tSave) })
async function find() {
  msg.value = ''
  try { await $fetch('/api/equity/exit/buyers', { method: 'POST', body: { ct: props.ct, focus: a.focus, about: a.about } }); await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not start the search.' }
}
const STATUS: Record<string, string> = { idea: 'Idea', shortlist: 'Shortlist', contacted: 'Contacted', talking: 'In talks', passed: 'Passed' }
const filter = ref('all')
const shown = computed(() => (plan.value?.buyers ?? []).filter((b) => filter.value === 'all' || b.status === filter.value || (filter.value === 'active' && b.status !== 'passed')).slice().sort((x, y) => y.fit - x.fit))
function setBuyer(b: Buyer, k: 'status' | 'notes', v: string) { b[k] = v; save(plan.value!.buyers) }
async function remove(b: Buyer) { if (!await askConfirm('Remove ' + b.name + ' from the list?')) return; plan.value!.buyers = plan.value!.buyers.filter((x) => x !== b); save(plan.value!.buyers) }
const nb = reactive({ open: false, name: '', website: '', why: '' })
function addBuyer() { if (!nb.name.trim()) return; plan.value!.buyers.push({ name: nb.name.trim(), website: nb.website.trim(), type: 'strategic', why: nb.why.trim(), fit: 3, deals: '', price_note: '', contact: { name: '', title: '', email: '', linkedin: '', url: '' }, sources: [], status: 'shortlist', notes: '', found_at: new Date().toISOString() }); save(plan.value!.buyers); Object.assign(nb, { open: false, name: '', website: '', why: '' }) }
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }
// Case cards and "who gets what": founders against everyone who invested, then holder by holder for the chosen case.
const kindOf = computed(() => new Map(props.data.holders.map((h) => [h.name, h.kind])))
const split = (s: typeof scen.value[number]) => { const r = s.wf?.rows ?? []; const f = r.filter((x) => kindOf.value.get(x.holder) === 'founder').reduce((t, x) => t + x.amount, 0); const i = r.filter((x) => kindOf.value.get(x.holder) === 'investor' || !kindOf.value.has(x.holder)).reduce((t, x) => t + x.amount, 0); return { f, i } }
const pick = ref('base')
const picked = computed(() => scen.value.find((s) => s.k === pick.value) ?? scen.value[1]!)
const who = computed(() => { const s = picked.value; if (!s.wf || !s.value) return []; const rs = [...s.wf.rows].sort((x, y) => y.amount - x.amount); const top = rs.slice(0, 12), rest = rs.slice(12)
  const max = Math.max(1, ...top.map((r) => r.amount)); const out = top.map((r) => ({ name: r.holder, how: r.how ?? '', amount: r.amount, pct: r.amount / s.value * 100, w: r.amount / max * 100, kind: kindOf.value.get(r.holder) ?? 'investor' }))
  if (rest.length) { const amt = rest.reduce((t, r) => t + r.amount, 0); out.push({ name: 'Everyone else (' + rest.length + ')', how: '', amount: amt, pct: amt / s.value * 100, w: Math.min(100, amt / max * 100), kind: 'other' }) } return out })
const fixed = computed(() => who.value.some((r) => /cash-out|repaid/i.test(r.how)))
const bm = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: a.currency || 'USD', notation: Math.abs(v) >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(v) >= 1e7 ? 1 : Math.abs(v) >= 1e6 ? 2 : 0 }).format(v)
const HOW: Record<string, string> = { common: 'Shares', options: 'Options, after the strike price' }
const howOf = (h: string) => h.split(' + ').map((x) => HOW[x] ?? x.charAt(0).toUpperCase() + x.slice(1)).join(' + ')
// The AI's reasons, one point per line rather than a block of text.
const aiWhy = computed(() => (plan.value?.assumptions.ai_multiples?.rationale ?? '').split(/(?<=\.)\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean))
const KC: Record<string, string> = { founder: '#0c1a2e', investor: '#8fb3d6', employee: '#1c547d', advisor: '#3d6e99', other: '#a8b4c2' }
</script>
<template>
  <div v-if="plan" class="xp">
    <div class="card">
      <div class="xh"><div><h3>Exit scenarios</h3><p class="mut">Sale value and what each holder receives, by case.</p></div><span class="mut">{{ saving ? 'Saving…' : '' }}</span></div>
      <section class="xin"><div class="xih"><b>If the company sold</b><span v-if="basisVal" class="mut">{{ a.basis === 'manual' ? 'Your figure' : a.basis === 'arr' ? 'ARR' : a.basis === 'ebitda_ttm' ? 'EBITDA' : 'Revenue' }} {{ bm(basisVal) }}{{ a.project ? ' in ' + exitYear : '' }}{{ plan.basis.growth_pct != null ? ' · growing ' + plan.basis.growth_pct + '% a year' : '' }}</span></div>
        <div class="xa xa4">
          <label class="label">Exit value based on<select v-model="a.basis"><option value="arr">ARR{{ plan.basis.arr ? ': ' + money(plan.basis.arr) : '' }}</option><option value="revenue_ttm">Revenue, last 12 months{{ plan.basis.revenue_ttm ? ': ' + money(plan.basis.revenue_ttm) : '' }}</option><option v-if="plan.basis.ebitda_ttm != null" value="ebitda_ttm">EBITDA, last 12 months: {{ money(plan.basis.ebitda_ttm) }}</option><option value="manual">A figure I enter (e.g. ARR at exit)</option></select></label>
          <label v-if="a.basis === 'manual'" class="label">Figure<input v-model.number="a.basis_value" type="number" min="0" step="10000"></label>
          <label class="label">Worst case ×<input v-model.number="a.worst" type="number" min="0" step="0.5"></label>
          <label class="label">Base case ×<input v-model.number="a.base" type="number" min="0" step="0.5"></label>
          <label class="label">Best case ×<input v-model.number="a.best" type="number" min="0" step="0.5"></label>
        </div>
        <p v-if="basisNote && a.basis !== 'manual'" class="src2">From your Financials: {{ basisNote }}.</p>
        <div v-if="a.basis !== 'manual'" class="xg2"><label class="chk"><input v-model="a.project" type="checkbox"> Grow it to the year of the sale</label>
          <template v-if="a.project"><label class="label">Years to the sale<input v-model.number="a.years" type="number" min="0" max="15" step="1"></label><label class="label">Growth a year (%)<input v-model.number="a.growth" type="number" min="-90" max="1000" step="5" :placeholder="plan.basis.growth_pct != null ? String(plan.basis.growth_pct) : 'e.g. 40'"></label>
            <span class="src2">{{ projFromModel != null ? 'Using your projection for ' + exitYear + ': ' + money(projFromModel) + '.' : money(nowVal) + ' today, growing ' + growthUsed + '% a year, is ' + money(basisVal) + ' in ' + exitYear + '.' }}</span></template></div>
        <p v-if="a.basis === 'ebitda_ttm' && (plan.basis.ebitda_ttm ?? 0) <= 0" class="warn">EBITDA is not positive yet: use revenue or ARR.</p>
        <p v-if="!basisVal" class="warn">No {{ a.basis === 'arr' ? 'ARR' : a.basis === 'revenue_ttm' ? 'revenue' : a.basis === 'ebitda_ttm' ? 'EBITDA' : 'figure' }} to work from{{ a.basis !== 'manual' ? ': ' + ((plan.basis as any).note || 'add revenue in Financials.') + ' Or choose "A figure I enter".' : '.' }}</p>
        <p v-else-if="(plan.basis as any).note" class="src2">{{ (plan.basis as any).note }}</p>
        <div v-if="plan.assumptions.ai_multiples" class="aim2"><div class="aimr"><span class="ey2">AI suggests</span><b>{{ plan.assumptions.ai_multiples.worst }}× · {{ plan.assumptions.ai_multiples.base }}× · {{ plan.assumptions.ai_multiples.best }}× {{ plan.assumptions.ai_multiples.basis === 'revenue_ttm' ? 'revenue' : 'ARR' }}</b><span class="mut aio">From similar sales of comparable companies.</span><button class="lk" type="button" @click="aiMore = !aiMore">{{ aiMore ? 'Hide the reasons' : 'Why these' }}</button><button class="btn sm" type="button" @click="useAi">Use these</button></div>
          <ul v-if="aiMore" class="aiw"><li v-for="(x, i) in aiWhy" :key="i">{{ x }}</li></ul></div>
        <label class="own">Or try your own sale price<input v-model.number="own" type="number" min="0" step="1000000" placeholder="e.g. 25000000"><span v-if="Number(own) > 0" class="mut sm">Added as a fourth case</span></label>
      </section>
      <p v-if="!hasShares" class="warn">Issue shares first to see what each holder receives.</p>
      <div v-if="basisVal && hasShares" class="cs3"><button v-for="sc in scen" :key="sc.k" type="button" class="csc" :class="{ on: pick === sc.k }" @click="pick = sc.k"><span>{{ sc.label }}{{ sc.mult != null ? ' · ' + sc.mult + '×' : '' }}</span><b>{{ bm(sc.value) }}</b><em>Founders get <b>{{ bm(split(sc).f) }}</b> · investors <b>{{ bm(split(sc).i) }}</b></em></button></div>
      <section v-if="basisVal && hasShares && who.length" class="wg"><div class="wgh"><b>Who gets what · {{ picked.label.toLowerCase() }}</b><span class="seg"><button v-for="sc in scen" :key="sc.k" type="button" :class="{ on: pick === sc.k }" @click="pick = sc.k">{{ sc.label.replace(' case', '') }}</button></span></div>
        <div v-for="r in who" :key="r.name" class="wr2"><span class="wn"><b>{{ r.name }}</b><em v-if="r.how">{{ howOf(r.how) }}</em></span><i class="wb"><i :style="{ width: Math.max(0.5, r.w) + '%', background: KC[r.kind] ?? '#a8b4c2' }" /></i><b class="r">{{ bm(r.amount) }}</b><span class="r mut">{{ (Math.round(r.pct * 10) / 10) }}%</span></div>
        <p v-if="fixed" class="xn">In a sale each SAFE either converts into shares or takes its money back, whichever pays more. That's why some investors get a fixed amount in every case.</p></section>
      <details v-if="basisVal && hasShares" class="full"><summary>All cases side by side</summary><div class="tw"><table class="t" data-nosearch>
        <thead><tr><th /><th v-for="s in scen" :key="s.k" class="r" :class="{ ownc: s.k === 'own' }">{{ s.label }}<em>{{ s.mult != null ? s.mult + '×' : 'Your figure' }}</em></th></tr></thead>
        <tbody><tr class="tot"><td><b>Exit value</b></td><td v-for="s in scen" :key="s.k" class="r"><b>{{ money(s.value) }}</b></td></tr>
          <tr v-for="r in rows" :key="r.name"><td>{{ r.name }}<span v-if="r.how" class="sub">{{ r.how }}</span></td><td v-for="(v, i) in r.v" :key="i" class="r">{{ money(v) }}<span class="sub">{{ scen[i]!.value ? Math.round(v / scen[i]!.value * 1000) / 10 + '%' : '' }}</span></td></tr>
          <tr><td>Per common share</td><td v-for="s in scen" :key="s.k" class="r">{{ s.wf ? '$' + s.wf.per_common.toLocaleString('en-US', { maximumFractionDigits: s.wf.per_common < 1 ? 4 : 2 }) : '—' }}</td></tr></tbody></table></div></details>
      <p class="fine">Before fees, taxes, earn-outs and escrow. An estimate, not financial advice.</p>
    </div>

    <div class="card">
      <div class="xh"><div><h3>Potential buyers</h3><p class="mut">Likely buyers, their past deals and how to reach them.</p></div>
        <span class="row"><button class="btn secondary sm" type="button" @click="nb.open = !nb.open">Add a buyer</button><button class="btn sm" type="button" :disabled="searching" @click="find">{{ searching ? 'Searching…' : plan.buyers.length ? 'Find more with AI' : 'Find buyers with AI' }}</button></span></div>
      <div class="xa"><label class="label w2">What the company does (for the search)<input v-model="a.about" maxlength="600" placeholder="e.g. Messaging and fraud-prevention APIs for African banks and fintechs" @change="save()"></label>
        <label class="label w2">Focus (optional)<input v-model="a.focus" maxlength="300" placeholder="e.g. telecoms and payments companies expanding into Africa" @change="save()"></label></div>
      <p v-if="searching" class="mut">Searching for buyers, their past deals and contact routes. This takes a minute or two.</p>
      <p v-else-if="plan.search.error" class="error">{{ plan.search.error }}</p>
      <p v-else-if="plan.search.note && plan.buyers.length" class="mut">{{ plan.search.note }}</p>
      <div v-if="nb.open" class="nb"><input v-model="nb.name" placeholder="Name" maxlength="160"><input v-model="nb.website" placeholder="Website" maxlength="300"><input v-model="nb.why" placeholder="Why they would buy" maxlength="600"><button class="btn sm" type="button" :disabled="!nb.name.trim()" @click="addBuyer">Add</button></div>
      <nav v-if="plan.buyers.length" class="tabs"><button v-for="[k, l] in [['all', 'All'], ['active', 'Active'], ['shortlist', 'Shortlist'], ['contacted', 'Contacted'], ['talking', 'In talks'], ['passed', 'Passed']]" :key="k" type="button" :class="{ on: filter === k }" @click="filter = k">{{ l }}</button></nav>
      <div v-for="b in shown" :key="b.name" class="by">
        <div class="byh"><div><b>{{ b.name }}</b> <span class="tag">{{ b.type === 'financial' ? 'Financial buyer' : 'Strategic buyer' }}</span><span class="fit" :title="'Fit ' + b.fit + ' of 5'"><i v-for="n in 5" :key="n" :class="{ on: n <= b.fit }" /></span>
          <a v-if="webUrl(b.website)" :href="webUrl(b.website)" target="_blank" rel="noopener noreferrer" class="lk">{{ host(b.website) }}</a></div>
          <span class="row"><select :value="b.status" :aria-label="'Status of ' + b.name" @change="setBuyer(b, 'status', ($event.target as HTMLSelectElement).value)"><option v-for="(l, k) in STATUS" :key="k" :value="k">{{ l }}</option></select><button class="lk" type="button" @click="remove(b)">Remove</button></span></div>
        <p v-if="b.why" class="why">{{ b.why }}</p>
        <p v-if="b.deals || b.price_note" class="mut">{{ [b.deals, b.price_note].filter(Boolean).join(' · ') }}</p>
        <p v-if="b.contact.name || b.contact.email || b.contact.linkedin || b.contact.url" class="ct"><span>Contact:</span> {{ [b.contact.name, b.contact.title].filter(Boolean).join(', ') }}
          <a v-if="b.contact.email" :href="'mailto:' + b.contact.email">{{ b.contact.email }}</a>
          <a v-if="webUrl(b.contact.linkedin)" :href="webUrl(b.contact.linkedin)" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <a v-if="webUrl(b.contact.url)" :href="webUrl(b.contact.url)" target="_blank" rel="noopener noreferrer">Corporate development</a></p>
        <p v-if="b.sources.length" class="src">Sources: <a v-for="u in b.sources" :key="u" :href="webUrl(u)" target="_blank" rel="noopener noreferrer">{{ host(u) }}</a></p>
        <input class="nt" :value="b.notes" placeholder="Notes (who knows them, last contact…)" maxlength="1000" @change="setBuyer(b, 'notes', ($event.target as HTMLInputElement).value)">
      </div>
      <p v-if="plan.buyers.length" class="fine">AI research: check names, deals and contacts before reaching out. Emails are only shown when published in the sources.</p>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
  </div>
</template>
<style scoped>
.xp { display: flex; flex-direction: column; gap: 16px; margin-bottom: 16px; } .xh { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; } .xh h3 { margin: 0 0 2px; }
.mut { color: var(--c-muted); font-size: 13px; margin: 0; } .row { display: flex; gap: 8px; align-items: center; } .error { color: var(--c-danger); font-size: 13px; margin: 6px 0 0; } .warn { color: var(--c-warn); font-size: 13px; margin: 6px 0 0; }
.xg { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; margin: -4px 0 12px } .xg label.label { display: flex; flex-direction: column; gap: 4px; width: 130px; font-size: 13px } .xg input[type=number] { width: 100%; font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff } .xg .mut { flex: 1 1 280px; font-size: 12.5px } .chk { display: flex; gap: 6px; align-items: center; font-size: 13.5px; padding-bottom: 8px }
.xa { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px 14px; margin: 12px 0; } .xa .w2 { grid-column: span 2; }
.xa input, .xa select, .nb input { width: 100%; font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; }
.own { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--c-ink-soft); margin: 0 0 12px; flex-wrap: wrap; } .own input { width: 180px; font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; } .sm { font-size: 12.5px; } .ownc { background: #f5f7fb; }
.aim .why { display: block; color: var(--c-ink-soft); margin-top: 4px; font-size: 12.5px; line-height: 1.5; } .aim .why.clip { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } .btn.sm { padding: 5px 10px; font-size: 12.5px; white-space: nowrap; }
.aim { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; background: var(--c-paper-3, #fafafa); border: 1px solid var(--c-line-soft); padding: 10px 12px; font-size: 13px; margin-bottom: 10px; }
.tw { overflow-x: auto; } .t { width: 100%; border-collapse: collapse; font-size: 13.5px; } .t th { text-align: left; font-weight: 500; color: var(--c-muted); font-size: 12.5px; padding: 8px 10px; border-bottom: 1px solid var(--c-rule); } .t th em { display: block; font-style: normal; color: var(--c-ink-soft); }
.t td { padding: 8px 10px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .r { text-align: right; } .tot td { background: var(--c-paper-2); } .sub { display: block; font-size: 11.5px; color: var(--c-muted); }
.fine { font-size: 12px; color: var(--c-muted); margin: 10px 0 0; }
.nb { display: grid; grid-template-columns: 1fr 1fr 2fr auto; gap: 8px; margin: 10px 0; }
.tabs { display: flex; gap: 18px; border-bottom: 1px solid var(--c-rule); margin: 12px 0 0; } .tabs button { background: none; border: 0; padding: 8px 0; font: inherit; font-size: 13.5px; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); }
.by { border-bottom: 1px solid var(--c-rule); padding: 12px 0; display: flex; flex-direction: column; gap: 4px; } .byh { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; } .byh b { font-size: 15px; font-weight: 600; }
.tag { font-size: 11.5px; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); margin: 0 6px; } .fit { display: inline-flex; gap: 2px; margin-right: 10px; vertical-align: middle; } .fit i { width: 7px; height: 7px; background: var(--c-rule-strong); } .fit i.on { background: var(--c-navy); }
.byh select { font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid var(--c-rule-strong); background: #fff; }
.why { margin: 0; font-size: 14px; } .ct, .src { margin: 0; font-size: 13px; color: var(--c-ink-soft); } .ct span, .src { color: var(--c-muted); } .ct a, .src a { margin-left: 8px; color: var(--c-blue-deep); }
.nt { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--c-line-soft); background: #fff; margin-top: 4px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; }
.cs3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 16px 0; } .csc { text-align: left; font: inherit; background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; } .csc.on { border-color: var(--c-navy); } .csc > span { font-size: 12.5px; color: var(--c-muted); } .csc > b { font-size: 26px; font-weight: 600; color: var(--c-navy); } .csc em { font-style: normal; font-size: 12.5px; color: var(--c-ink-soft); } .csc em b { font-weight: 600; }
.wg { border: 1px solid var(--c-rule); padding: 18px 20px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; } .wgh { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; } .wgh > b { font-size: 15px; color: var(--c-navy); }
.seg { display: inline-flex; border: 1px solid #d5d2cb; } .seg button { font: inherit; font-size: 12.5px; border: 0; background: #fff; padding: 5px 11px; cursor: pointer; } .seg button.on { background: var(--c-navy); color: #fff; }
.wr2 { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.4fr) 100px 56px; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .wn { display: flex; flex-direction: column; min-width: 0; } .wn em { font-style: normal; font-size: 12px; color: var(--c-muted); } .wb { display: block; height: 10px; background: #f1f0ec; } .wb > i { display: block; height: 100%; }
.xn { margin: 10px 0 0; font-size: 13px; color: var(--c-ink-soft); background: var(--c-paper-2); padding: 10px 12px; } .full summary { cursor: pointer; font-size: 13.5px; color: var(--c-blue-deep); padding: 6px 0 10px; }
@media (max-width: 760px) { .wr2 { grid-template-columns: minmax(0, 1fr) 90px; } .wr2 .wb, .wr2 .mut { display: none; } }
.xin { border: 1px solid #c9d6e5; background: #f5f8fb; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; margin: 14px 0 0; } .xih { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; } .xih b { font-size: 15px; color: var(--c-navy); } .xih .mut { font-size: 12.5px; }
.xa4 { grid-template-columns: minmax(0, 1.5fr) repeat(auto-fit, minmax(110px, 1fr)); margin: 0; } .xin .xa input, .xin .xa select, .xin .xg2 input, .xin .own input { border-color: #c9d6e5; background: #fff; }
.src2 { margin: 0; font-size: 12.5px; color: var(--c-muted); } .xg2 .src2 { flex: 1 1 260px; } .xg2 { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; } .xg2 label.label { display: flex; flex-direction: column; gap: 4px; width: 140px; font-size: 13px; } .xg2 input[type=number] { width: 100%; font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid #c9d6e5; }
.aim2 { background: #fff; border: 1px solid #c9d6e5; padding: 12px 14px; font-size: 13px; } .aimr { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; } .ey2 { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--c-blue-deep); } .aio { flex: 1 1 200px; }
.aiw { margin: 10px 0 0; padding: 10px 0 0 18px; border-top: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 6px; color: var(--c-ink-soft); line-height: 1.5; } .xin .own { margin: 0; }
@media (max-width: 760px) { .xa4 { grid-template-columns: 1fr 1fr; } .xa4 > label:first-child { grid-column: 1 / -1; } }
</style>
