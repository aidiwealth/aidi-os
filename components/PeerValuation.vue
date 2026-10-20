<script setup lang="ts">
// Cap table → Valuation: what the company could be worth next to similar companies. AI finds listed peers and similar
// private rounds and acquisitions (with their multiples, the date and the page each comes from); the founder ticks,
// corrects or adds peers; the company's own figures from Financials do the rest (shared/valuation.ts).
import { valuate, cleanPeer, type Peer, type ValAssumptions, type ValCompany } from '~/shared/valuation'
const props = defineProps<{ ct: string }>()
const emit = defineEmits<{ 'to-exit': [] }>()
interface Res { ct: string; assumptions: ValAssumptions; peers: Peer[]; searched_at: string | null; search: { status: string; error: string | null; note: string | null }; company: ValCompany; about: string; name: string }
const { data: v, refresh } = await useFetch<Res>('/api/equity/valuation', { query: { ct: computed(() => props.ct) } })
const a = reactive<ValAssumptions>({ basis: 'revenue_ttm', private_discount: 25, market_discount: 0, about: '', focus: '', ai: null })
const peers = ref<Peer[]>([])
watch(v, (x) => { if (!x) return; Object.assign(a, x.assumptions, { about: x.assumptions.about || x.about }); peers.value = x.peers.map((p) => ({ ...p })) }, { immediate: true })
const res = computed(() => (v.value ? valuate(v.value.company, peers.value, a) : null))
const c = computed(() => v.value?.company)

const money = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: Math.abs(n) >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(n) >= 1e6 ? 1 : 0 }).format(n))
const pct = (n: number | null | undefined) => (n == null ? '—' : (Math.round(n * 10) / 10) + '%')
const x = (n: number | null | undefined) => (n == null ? '—' : (Math.round(n * 10) / 10) + '×')

// Saving: assumptions after a pause, peers straight away.
const saving = ref(false), msg = ref('')
let tSave: ReturnType<typeof setTimeout> | undefined
function save(withPeers = false) {
  clearTimeout(tSave)
  tSave = setTimeout(async () => {
    saving.value = true; msg.value = ''
    try { await $fetch('/api/equity/valuation', { method: 'POST', body: { ct: props.ct, assumptions: { basis: a.basis, private_discount: Number(a.private_discount) || 0, market_discount: Number(a.market_discount) || 0, about: a.about, focus: a.focus }, peers: withPeers ? peers.value : undefined } }) }
    catch (e) { msg.value = errMsg(e, 'Could not save.') } finally { saving.value = false }
  }, withPeers ? 0 : 700)
}
watch(() => [a.basis, a.private_discount, a.market_discount], () => save())
const errMsg = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? d
function useAi() { if (!a.ai) return; a.private_discount = a.ai.private_discount; a.market_discount = a.ai.market_discount }

// The AI search runs on the server; this follows it.
const searching = computed(() => v.value?.search.status === 'running')
let poll: ReturnType<typeof setInterval> | undefined
watch(searching, (s) => { clearInterval(poll); if (s) poll = setInterval(() => refresh(), 4000) }, { immediate: true })
onBeforeUnmount(() => { clearInterval(poll); clearTimeout(tSave) })
async function find() {
  msg.value = ''
  try { await $fetch('/api/equity/valuation/peers', { method: 'POST', body: { ct: props.ct, about: a.about, focus: a.focus } }); await refresh() }
  catch (e) { msg.value = errMsg(e, 'Could not start the search.') }
}

// Peers: tick, correct a figure, remove, add by hand.
const KIND: Record<string, string> = { public: 'Listed', private: 'Private round', acquisition: 'Acquisition' }
const shown = computed(() => [...peers.value].sort((p, q) => (p.kind === q.kind ? (q.ev_revenue ?? 0) - (p.ev_revenue ?? 0) : p.kind === 'public' ? -1 : q.kind === 'public' ? 1 : 0)))
function setNum(p: Peer, k: 'ev_revenue' | 'ev_ebitda' | 'growth_pct' | 'gross_margin_pct', val: string) { const n = val.trim() === '' ? null : Number(val); p[k] = n !== null && Number.isFinite(n) ? n : null; save(true) }
function toggle(p: Peer) { p.use = !p.use; save(true) }
async function remove(p: Peer) { if (!await askConfirm('Remove ' + p.name + '?')) return; peers.value = peers.value.filter((y) => y !== p); save(true) }
const np = reactive({ open: false, name: '', kind: 'public' as Peer['kind'], ev_revenue: '', gross_margin_pct: '', growth_pct: '' })
function addPeer() {
  if (!np.name.trim()) return
  peers.value.push(cleanPeer({ name: np.name, kind: np.kind, ev_revenue: np.ev_revenue, gross_margin_pct: np.gross_margin_pct, growth_pct: np.growth_pct, as_of: new Date().toISOString().slice(0, 10), use: true, added: 'founder' }, 'founder'))
  Object.assign(np, { open: false, name: '', ev_revenue: '', gross_margin_pct: '', growth_pct: '' }); save(true)
}
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }

// The range chart: each method from its low to its high, the median marked.
const top = computed(() => Math.max(1, ...(res.value?.methods ?? []).map((m) => m.ev[2] + (res.value?.net_cash ?? 0))))
const bar = (lo: number, hi: number) => ({ left: Math.max(0, lo / top.value * 100) + '%', width: Math.max(0.8, (hi - lo) / top.value * 100) + '%' })
const toExit = ref(false)
async function sendToExit() {
  msg.value = ''; toExit.value = true
  try { await $fetch('/api/equity/valuation/to-exit', { method: 'POST', body: { ct: props.ct } }); emit('to-exit') }
  catch (e) { msg.value = errMsg(e, 'Could not set the exit multiples.') } finally { toExit.value = false }
}
</script>

<template>
  <div v-if="v && c && res" class="pv">
    <div class="card">
      <div class="hh"><div><h3>What the business could be worth</h3><p class="mut">Your figures from Financials against what similar listed companies trade at and what similar private companies were priced at. {{ saving ? 'Saving…' : '' }}</p></div>
        <label class="label sel">Value on<select v-model="a.basis"><option value="revenue_ttm">Revenue, last 12 months{{ c.revenue_ttm ? ': ' + money(c.revenue_ttm) : '' }}</option><option value="run_rate">Run rate (latest month × 12){{ c.run_rate ? ': ' + money(c.run_rate) : '' }}</option><option v-if="c.arr" value="arr">ARR: {{ money(c.arr) }}</option></select></label></div>
      <div class="kp">
        <div><span>Revenue, 12 months</span><b>{{ money(c.revenue_ttm) }}</b><em>{{ c.ttm_source || 'From Financials' }}</em></div>
        <div><span>Growth</span><b>{{ pct(c.growth_pct) }}</b><em>{{ c.growth_source || '—' }}</em></div>
        <div><span>Gross margin</span><b>{{ pct(c.gross_margin_pct) }}</b><em>{{ c.business_type || 'Last 12 months' }}</em></div>
        <div><span>EBITDA, 12 months</span><b>{{ money(c.ebitda_ttm) }}</b><em>{{ c.ebitda_margin_pct != null ? pct(c.ebitda_margin_pct) + ' of revenue' : '—' }}</em></div>
        <div><span>Net cash</span><b>{{ money(res.net_cash) }}</b><em>Cash less debt, latest month</em></div>
      </div>

      <template v-if="res.equity">
        <div class="big"><div><span>Equity value</span><b>{{ money(res.equity[0]) }} – {{ money(res.equity[2]) }}</b><em>Middle {{ money(res.equity[1]) }} · enterprise value {{ money(res.ev![1]) }} {{ res.net_cash >= 0 ? '+' : '−' }} net cash {{ money(Math.abs(res.net_cash)) }}</em></div>
          <button class="btn secondary sm" type="button" :disabled="toExit || !res.methods.some((m) => m.key === 'ev_revenue')" title="Set the Exit tab's worst / base / best multiples from these peers" @click="sendToExit">Use for exit scenarios</button></div>
        <div class="ff">
          <div v-for="m in res.methods" :key="m.key" class="fr">
            <div class="fl"><b>{{ m.label }}</b><span>{{ x(m.low) }} · {{ x(m.mid) }} · {{ x(m.high) }} of {{ m.metric.toLowerCase() }} · {{ m.peers }} peers</span></div>
            <div class="track"><i class="rng" :style="bar(m.ev[0] + res.net_cash, m.ev[2] + res.net_cash)" /><i class="mid" :style="{ left: Math.max(0, (m.ev[1] + res.net_cash) / top * 100) + '%' }" /></div>
            <div class="fv">{{ money(m.ev[0] + res.net_cash) }} – {{ money(m.ev[2] + res.net_cash) }}</div>
          </div>
        </div>
        <p class="mut sm">Equity value after a {{ res.discount }}% discount ({{ a.private_discount }}% for being private, {{ a.market_discount }}% for market risk). Low and high are the peers' 25th and 75th percentile multiples; the middle is the median.</p>
      </template>
      <EmptyState v-else compact icon="chart" title="No range yet" :text="res.warnings[0] || 'Find peers with AI, or add peers you know, to see a range.'" />
      <ul v-if="res.warnings.length && res.equity" class="wr"><li v-for="w in res.warnings" :key="w">{{ w }}</li></ul>
      <div v-if="a.ai?.summary" class="ai"><b>Where you sit</b><p>{{ a.ai.summary }}</p></div>
    </div>

    <div class="card">
      <div class="hh"><div><h3>Discounts</h3><p class="mut">Listed companies can be sold any day; private shares cannot, and some markets carry more risk. Both lower what a buyer or investor would pay.</p></div></div>
      <div class="ds"><label class="label">Private company (%)<input v-model.number="a.private_discount" type="number" min="0" max="90" step="5"></label><label class="label">Market risk (%)<input v-model.number="a.market_discount" type="number" min="0" max="90" step="5"></label>
        <div v-if="a.ai" class="sug"><span><b>Suggested: {{ a.ai.private_discount }}% and {{ a.ai.market_discount }}%</b> {{ a.ai.rationale }}</span><button class="lk" type="button" @click="useAi">Use these</button></div></div>
      <table v-if="res.compare.some((r) => r.peers != null)" class="t cmp" data-nosearch><thead><tr><th /><th class="r">You</th><th class="r">Peer median</th></tr></thead>
        <tbody><tr v-for="r in res.compare" :key="r.label"><td>{{ r.label }}</td><td class="r">{{ r.unit === '%' ? pct(r.company) : x(r.company) }}</td><td class="r">{{ r.unit === '%' ? pct(r.peers) : x(r.peers) }}</td></tr></tbody></table>
    </div>

    <div class="card">
      <div class="hh"><div><h3>Trading peers and deals</h3><p class="mut">Tick the companies that are truly like yours. Correct any figure; the range updates as you go.</p></div>
        <span class="row"><button class="btn secondary sm" type="button" @click="np.open = !np.open">Add a peer</button><button class="btn sm" type="button" :disabled="searching" @click="find">{{ searching ? 'Searching…' : peers.length ? 'Refresh with AI' : 'Find peers with AI' }}</button></span></div>
      <div class="ab"><label class="label w2">What the company does<input v-model="a.about" maxlength="600" placeholder="e.g. Messaging, voice and fraud-prevention APIs for banks and fintechs in Africa" @change="save()"></label>
        <label class="label">Focus (optional)<input v-model="a.focus" maxlength="300" placeholder="e.g. CPaaS, emerging markets" @change="save()"></label></div>
      <p v-if="searching" class="mut">Looking for listed peers, their latest multiples and similar deals. This takes a minute or two; you can leave this page.</p>
      <p v-else-if="v.search.error" class="error">{{ v.search.error }}</p>
      <p v-else-if="v.search.note && peers.length" class="mut">{{ v.search.note }}</p>
      <div v-if="np.open" class="np"><input v-model="np.name" placeholder="Company" maxlength="120"><select v-model="np.kind"><option value="public">Listed</option><option value="private">Private round</option><option value="acquisition">Acquisition</option></select>
        <input v-model="np.ev_revenue" type="number" step="0.1" placeholder="EV / revenue ×"><input v-model="np.gross_margin_pct" type="number" step="1" placeholder="Gross margin %"><input v-model="np.growth_pct" type="number" step="1" placeholder="Growth %"><button class="btn sm" type="button" :disabled="!np.name.trim()" @click="addPeer">Add</button></div>
      <div v-if="peers.length" class="tw"><table class="t pt" data-nosearch>
        <thead><tr><th /><th>Company</th><th class="r">EV / revenue</th><th class="r">EV / EBITDA</th><th class="r">Growth</th><th class="r">Gross margin</th><th>As of</th><th /></tr></thead>
        <tbody><tr v-for="p in shown" :key="p.name" :class="{ off: !p.use }">
          <td><input type="checkbox" :checked="p.use" :aria-label="'Use ' + p.name" @change="toggle(p)"></td>
          <td><b>{{ p.name }}</b> <span class="tag">{{ KIND[p.kind] }}</span><span class="sub">{{ [p.ticker, p.country].filter(Boolean).join(' · ') }}{{ p.why ? ' — ' + p.why : '' }}</span></td>
          <td class="r"><input class="nm" :value="p.ev_revenue ?? ''" type="number" step="0.1" :aria-label="'EV / revenue for ' + p.name" @change="setNum(p, 'ev_revenue', ($event.target as HTMLInputElement).value)"></td>
          <td class="r"><input class="nm" :value="p.ev_ebitda ?? ''" type="number" step="0.5" :aria-label="'EV / EBITDA for ' + p.name" @change="setNum(p, 'ev_ebitda', ($event.target as HTMLInputElement).value)"></td>
          <td class="r"><input class="nm" :value="p.growth_pct ?? ''" type="number" step="1" :aria-label="'Growth for ' + p.name" @change="setNum(p, 'growth_pct', ($event.target as HTMLInputElement).value)"></td>
          <td class="r"><input class="nm" :value="p.gross_margin_pct ?? ''" type="number" step="1" :aria-label="'Gross margin for ' + p.name" @change="setNum(p, 'gross_margin_pct', ($event.target as HTMLInputElement).value)"></td>
          <td class="ao">{{ p.as_of || '—' }}<a v-if="p.source && webUrl(p.source)" :href="webUrl(p.source)" target="_blank" rel="noopener noreferrer" class="lk">{{ host(p.source) }}</a><span v-else-if="p.added === 'founder'" class="sub">Added by you</span></td>
          <td><button class="lk" type="button" @click="remove(p)">Remove</button></td></tr></tbody></table></div>
      <EmptyState v-else-if="!searching" compact icon="pipeline" title="No peers yet" text="Find peers with AI: listed companies like yours with their latest multiples, and similar private rounds and acquisitions." />
      <p class="fine">AI research: multiples move with the markets, so check each figure against its page before you use the range with investors. An estimate, not financial advice.</p>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
  </div>
</template>

<style scoped>
.pv { display: flex; flex-direction: column; gap: 16px; margin-bottom: 16px; } .hh { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; } .hh h3 { margin: 0 0 2px; }
.mut { color: var(--c-muted); font-size: 13px; margin: 0; } .sm { font-size: 12.5px; margin-top: 8px; } .row { display: flex; gap: 8px; align-items: center; } .error { color: var(--c-danger); font-size: 13px; margin: 6px 0 0; }
.label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--c-ink-soft); } .sel select { min-width: 260px; }
.label input, .label select, .np input, .np select { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; }
.kp { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid var(--c-rule); margin: 14px 0; } .kp > div { padding: 10px 12px; border-right: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 2px; min-width: 0; } .kp > div:last-child { border-right: 0; }
.kp span { font-size: 13px; font-weight: 500; color: var(--c-muted); } .kp b { font-family: var(--font-heading); font-size: 22px; font-weight: 500; letter-spacing: -.02em; color: var(--c-navy); } .kp em { font-style: normal; font-size: 11.5px; color: var(--c-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.big { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; padding: 14px 16px; background: var(--c-navy); color: #fff; } .big span { font-size: 12px; opacity: .75; display: block; } .big b { font-family: var(--font-heading); font-size: 28px; font-weight: 500; letter-spacing: -.01em; display: block; } .big em { font-style: normal; font-size: 12.5px; opacity: .8; }
.big .btn { background: #fff; color: var(--c-navy); border-color: #fff; }
.ff { display: flex; flex-direction: column; gap: 12px; margin: 16px 0 4px; } .fr { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.4fr) 170px; gap: 14px; align-items: center; }
.fl b { display: block; font-size: 13.5px; font-weight: 500; } .fl span { font-size: 12px; color: var(--c-muted); } .fv { font-size: 13px; text-align: right; font-variant-numeric: tabular-nums; }
.track { position: relative; height: 14px; background: var(--c-paper-2, #f4f6fa); } .rng { position: absolute; top: 0; bottom: 0; background: #9fb4d6; } .mid { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--c-navy); }
.wr { margin: 10px 0 0; padding-left: 18px; font-size: 13px; color: var(--c-warn); } .ai { border: 1px solid var(--c-rule); padding: 10px 14px; margin-top: 12px; font-size: 13.5px; } .ai b { font-weight: 500; color: var(--c-ink); } .ai p { margin: 4px 0 0; color: var(--c-ink-soft); line-height: 1.55; }
.ds { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; margin: 12px 0; } .ds .label { width: 160px; } .sug { flex: 1 1 320px; display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; border: 1px solid var(--c-rule); padding: 8px 12px; font-size: 13px; color: var(--c-ink-soft); } .sug b { color: var(--c-ink); font-weight: 500; }
.ab { display: grid; grid-template-columns: 2fr 1fr; gap: 10px 14px; margin: 12px 0; } .ab input { width: 100%; }
.np { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto; gap: 8px; margin: 10px 0; }
.tw { overflow-x: auto; } .t { width: 100%; border-collapse: collapse; font-size: 13.5px; } .t th { text-align: left; font-weight: 500; color: var(--c-muted); font-size: 12.5px; padding: 8px 10px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; }
.t td { padding: 8px 10px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .r, .t th.r { text-align: right; } .cmp { max-width: 520px; } tr.off td { color: var(--c-muted); } tr.off b { font-weight: 400; }
.sub { display: block; font-size: 12px; color: var(--c-muted); margin-top: 2px; } .tag { font-size: 11px; padding: 1px 7px; background: var(--c-paper-2, #f4f6fa); color: var(--c-ink-soft); margin-left: 4px; }
.nm { width: 74px; font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid var(--c-line-soft, #e3e6ec); background: #fff; text-align: right; } .ao { white-space: nowrap; font-size: 12.5px; } .ao .lk { display: block; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; } .btn.sm { padding: 5px 10px; font-size: 12.5px; white-space: nowrap; }
.fine { font-size: 12px; color: var(--c-muted); margin: 10px 0 0; }
@media (max-width: 860px) { .kp { grid-template-columns: 1fr 1fr; } .kp > div { border-bottom: 1px solid var(--c-rule); } .fr { grid-template-columns: 1fr; gap: 6px; } .fv { text-align: left; } .ab, .np { grid-template-columns: 1fr; } }
</style>
