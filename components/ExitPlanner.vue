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
</script>
<template>
  <div v-if="plan" class="xp">
    <div class="card">
      <div class="xh"><div><h3>Exit scenarios</h3><p class="mut">What the company could sell for, and what each holder would receive, in worst, base and best cases.</p></div><span class="mut">{{ saving ? 'Saving…' : '' }}</span></div>
      <div class="xa">
        <label class="label">Exit value based on<select v-model="a.basis"><option value="arr">ARR{{ plan.basis.arr ? ': ' + money(plan.basis.arr) : '' }}</option><option value="revenue_ttm">Revenue, last 12 months{{ plan.basis.revenue_ttm ? ': ' + money(plan.basis.revenue_ttm) : '' }}</option><option v-if="plan.basis.ebitda_ttm != null" value="ebitda_ttm">EBITDA, last 12 months: {{ money(plan.basis.ebitda_ttm) }}</option><option value="manual">A figure I enter (e.g. ARR at exit)</option></select></label>
        <label v-if="a.basis === 'manual'" class="label">Figure<input v-model.number="a.basis_value" type="number" min="0" step="10000"></label>
        <label class="label">Worst ×<input v-model.number="a.worst" type="number" min="0" step="0.5"></label>
        <label class="label">Base ×<input v-model.number="a.base" type="number" min="0" step="0.5"></label>
        <label class="label">Best ×<input v-model.number="a.best" type="number" min="0" step="0.5"></label>
      </div>
      <div v-if="a.basis !== 'manual'" class="xg"><label class="chk"><input v-model="a.project" type="checkbox"> Grow it to the exit year</label>
        <template v-if="a.project"><label class="label">Years to exit<input v-model.number="a.years" type="number" min="0" max="15" step="1"></label><label class="label">Growth a year (%)<input v-model.number="a.growth" type="number" min="-90" max="1000" step="5" :placeholder="plan.basis.growth_pct != null ? String(plan.basis.growth_pct) : 'e.g. 40'"></label></template>
        <span class="mut">{{ basisNote ? 'From your Financials: ' + basisNote + '.' : '' }}{{ a.project ? (projFromModel != null ? ' Using your projection for ' + exitYear + ': ' + money(projFromModel) + '.' : ' ' + money(nowVal) + ' today, growing ' + growthUsed + '% a year → ' + money(basisVal) + ' in ' + exitYear + '.') : '' }}{{ plan.basis.growth_pct != null ? ' Growth in your figures: ' + plan.basis.growth_pct + '% a year (' + plan.basis.growth_source.toLowerCase() + ').' : '' }}</span></div>
      <p v-if="a.basis === 'ebitda_ttm' && (plan.basis.ebitda_ttm ?? 0) <= 0" class="warn">EBITDA is not positive yet, so an EBITDA multiple gives no value: use revenue or ARR.</p>
      <p v-if="!basisVal" class="warn">No {{ a.basis === 'arr' ? 'ARR' : a.basis === 'revenue_ttm' ? 'revenue' : a.basis === 'ebitda_ttm' ? 'EBITDA' : 'figure' }} to work from{{ a.basis !== 'manual' ? ': ' + ((plan.basis as any).note || 'add revenue in Financials.') + ' Or choose "A figure I enter".' : '.' }}</p>
      <p v-else-if="(plan.basis as any).note" class="mut sm">{{ (plan.basis as any).note }}</p>
      <div v-if="plan.assumptions.ai_multiples" class="aim"><span><b>Suggested multiples: {{ plan.assumptions.ai_multiples.worst }}× · {{ plan.assumptions.ai_multiples.base }}× · {{ plan.assumptions.ai_multiples.best }}×</b> {{ plan.assumptions.ai_multiples.basis === 'revenue_ttm' ? 'revenue' : 'ARR' }}<span class="why" :class="{ clip: !aiMore }">{{ plan.assumptions.ai_multiples.rationale }}</span><button v-if="plan.assumptions.ai_multiples.rationale.length > 160" class="lk sm" type="button" @click="aiMore = !aiMore">{{ aiMore ? 'Less' : 'Why these' }}</button></span><button class="btn secondary sm" type="button" @click="useAi">Use these</button></div>
      <label class="own">Or try your own sale price<input v-model.number="own" type="number" min="0" step="1000000" placeholder="e.g. 25000000"><span v-if="Number(own) > 0" class="mut sm">Added as a column below</span></label>
      <p v-if="!hasShares" class="warn">Issue the shares first (Shareholders) to see what each holder receives.</p>
      <div v-if="basisVal && hasShares" class="tw"><table class="t" data-nosearch>
        <thead><tr><th /><th v-for="s in scen" :key="s.k" class="r" :class="{ ownc: s.k === 'own' }">{{ s.label }}<em>{{ s.mult != null ? s.mult + '×' : 'Your figure' }}</em></th></tr></thead>
        <tbody><tr class="tot"><td><b>Exit value</b></td><td v-for="s in scen" :key="s.k" class="r"><b>{{ money(s.value) }}</b></td></tr>
          <tr v-for="r in rows" :key="r.name"><td>{{ r.name }}<span v-if="r.how" class="sub">{{ r.how }}</span></td><td v-for="(v, i) in r.v" :key="i" class="r">{{ money(v) }}<span class="sub">{{ scen[i]!.value ? Math.round(v / scen[i]!.value * 1000) / 10 + '%' : '' }}</span></td></tr>
          <tr><td>Per common share</td><td v-for="s in scen" :key="s.k" class="r">{{ s.wf ? '$' + s.wf.per_common.toLocaleString('en-US', { maximumFractionDigits: s.wf.per_common < 1 ? 4 : 2 }) : '—' }}</td></tr></tbody></table></div>
      <p class="fine">Before fees, taxes, earn-outs and escrow. Preferred classes take their preference or convert, whichever pays more; SAFEs and notes are paid back or convert at their cap or discount, whichever is worth more; options receive the price less their strike. An estimate, not financial advice.</p>
    </div>

    <div class="card">
      <div class="xh"><div><h3>Potential buyers</h3><p class="mut">Companies and funds likely to buy a business like yours, with why, what they have bought before and how to reach them.</p></div>
        <span class="row"><button class="btn secondary sm" type="button" @click="nb.open = !nb.open">Add a buyer</button><button class="btn sm" type="button" :disabled="searching" @click="find">{{ searching ? 'Searching…' : plan.buyers.length ? 'Find more with AI' : 'Find buyers with AI' }}</button></span></div>
      <div class="xa"><label class="label w2">What the company does (for the search)<input v-model="a.about" maxlength="600" placeholder="e.g. Messaging and fraud-prevention APIs for African banks and fintechs" @change="save()"></label>
        <label class="label w2">Focus (optional)<input v-model="a.focus" maxlength="300" placeholder="e.g. telecoms and payments companies expanding into Africa" @change="save()"></label></div>
      <p v-if="searching" class="mut">Searching for buyers, their past deals and contact routes. This takes a minute or two; you can leave this page.</p>
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
</style>
