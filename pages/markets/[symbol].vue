<script setup lang="ts">
// One symbol, charts first: the live price chart (1D to 5Y) with the fair value marked, the value against the price,
// key statistics, and tabs for the overview (the business over time, what the price assumes), the valuation (how the
// value is built, the forecast, what moves it, the scenarios), risk (beta, volatility, falls) and the AI's review.
// Every figure comes from a stored valuation version. The AI keeps it up to date (it reviews the company and sets the
// drivers); the price and signal update every 15 seconds while the page is open; the team can override the drivers.
import { usd, big, pct, signed, fixed, ptTime, day, month } from '~/shared/market-format'
const route = useRoute(); const router = useRouter()
const sym = computed(() => String(route.params.symbol ?? '').toUpperCase())
const vq = computed(() => (route.query.v ? String(route.query.v) : undefined))
const { data, error, refresh, pending } = await useFetch<any>(() => '/api/markets/' + encodeURIComponent(sym.value), { query: { v: vq } })
useHead({ title: () => (data.value?.instrument?.name ? sym.value + ' · ' + data.value.instrument.name : sym.value) })
const TABS = computed(() => [['overview', 'Overview'], ...(data.value?.valuation?.result?.dcf || data.value?.valuation?.result?.ddm != null ? [['valuation', 'Valuation']] : []), ['risk', 'Risk'], ...(data.value?.ai_on || data.value?.review ? [['ai', 'AI review']] : [])] as [string, string][])
const tab = computed({ get: () => String(route.query.t ?? 'overview'), set: (t: string) => router.replace({ query: { ...route.query, t } }) })
const v = computed(() => data.value?.valuation ?? null), r = computed(() => v.value?.result ?? {}), inp = computed(() => v.value?.inputs ?? {})
const price = computed(() => data.value?.quote?.price ?? null)
const KIND: Record<string, string> = { stock: 'Stock', etf: 'ETF', crypto: 'Crypto' }
const isLatest = computed(() => !vq.value || vq.value === data.value?.latest_id)
const sc = computed(() => r.value.scenarios ?? null)
// The banner already says when the market risk premium is missing.
const warnings = computed(() => ((r.value.warnings ?? []) as string[]).filter((w) => !(w.startsWith('The market risk premium is not set') && !data.value?.mrp_set)))

// The price chart: one range at a time, fetched when picked; the open range refreshes with the live price.
const RANGES = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y'] as const
const range = ref<typeof RANGES[number]>('1Y')
const showFair = ref(true)
const ch = ref<{ points: { t: string; v: number }[]; base: number | null; intraday: boolean } | null>(null)
async function loadChart() { try { ch.value = await $fetch<any>('/api/markets/' + encodeURIComponent(sym.value) + '/chart', { query: { r: range.value } }) } catch { ch.value = null } }
watch([range, sym], loadChart)
onMounted(loadChart)
const chg = computed(() => { const p = ch.value?.points, l = price.value ?? p?.[p.length - 1]?.v, b = range.value === '1D' ? data.value?.quote?.prev_close ?? ch.value?.base : ch.value?.base; return l != null && b ? { abs: l - b, pct: ((l - b) / b) * 100 } : null })
const RLABEL: Record<string, string> = { '1D': 'today', '1W': 'past week', '1M': 'past month', '3M': 'past 3 months', YTD: 'this year', '1Y': 'past year', '5Y': 'past 5 years' }
const fairRefs = computed(() => (showFair.value && sc.value?.weighted ? [{ v: sc.value.weighted, label: 'Fair value' }] : []))
const fairBand = computed(() => (showFair.value && sc.value?.bear != null && sc.value?.bull != null ? [sc.value.bear, sc.value.bull] as [number, number] : null))
// 52-week range: where today's price sits between the low and the high.
const r52 = computed(() => { const s = data.value?.stats; return s?.hi52 && s?.lo52 && price.value ? Math.min(100, Math.max(0, ((price.value - s.lo52) / (s.hi52 - s.lo52 || 1)) * 100)) : null })
// What the price assumes against what the business did and what the forecast says.
const growthRows = computed(() => { const x = r.value, d = v.value?.drivers; const avg = d?.growth?.length ? d.growth.reduce((a: number, g: number) => a + g, 0) / d.growth.length : null
  return [{ label: "Today's price assumes", value: x.implied_growth ?? null, note: 'a year for 10 years' }, { label: driversBy.value === 'ai' ? 'AI forecast' : driversBy.value === 'team' ? 'Team forecast' : 'Forecast in use', value: avg, note: '10-year average' }, { label: 'Last five years', value: x.history_growth ?? null, note: 'actual' }].filter((q) => q.value != null) })
// Expected against required return, as two bars on one scale.
const retMax = computed(() => Math.max(1, Math.abs(data.value?.live?.er ?? 0), Math.abs(r.value.re ?? 0)) * 1.15)
const retW = (x: number | null | undefined) => (x == null ? 0 : (Math.abs(x) / retMax.value) * 100)
// How the value is built, and the free cash flow forecast.
const bridge = computed(() => { const d = r.value.dcf, c = inp.value.capital; return d && c ? { start: { label: '10 yrs of cash', value: d.pv_fcf }, steps: [{ label: 'After year 10', value: d.pv_tv }, { label: 'Net debt', value: -c.net_debt }], end: 'Equity' } : null })
const fcfRows = computed(() => ((r.value.dcf?.rows ?? []) as any[]).map((x) => ({ label: 'Y' + x.year, value: x.fcf, pct: null, forecast: true })))
const scenarioRows = computed(() => (sc.value ? [{ label: 'Bear (' + sc.value.p[0] + '%)', value: sc.value.bear }, { label: 'Base (' + sc.value.p[1] + '%)', value: sc.value.base }, { label: 'Bull (' + sc.value.p[2] + '%)', value: sc.value.bull }, { label: 'Weighted', value: sc.value.weighted }] : []))
// Falls from the previous high over five years (weekly closes).
const drawdown = computed(() => { let peak = 0; return ((data.value?.chart ?? []) as { d: string; close: number }[]).map((p) => { peak = Math.max(peak, p.close); return { t: p.d, v: (p.close / peak - 1) * 100 } }) })

// Live: every 15 seconds while the page is visible, the price and the signal at that price; the whole page reloads when
// the AI finishes a review, a new version is saved or the market risk premium arrives.
let poll: ReturnType<typeof setInterval> | null = null
async function tick() {
  if (document.hidden || !data.value || error.value) return
  try {
    const l = await $fetch<any>('/api/markets/' + encodeURIComponent(sym.value) + '/live')
    if (l.version_id !== data.value.latest_id || (l.review_id ?? null) !== (data.value.review?.id ?? null) || l.review_applied !== (data.value.review?.applied ?? false) || l.mrp_set !== data.value.mrp_set) { await refresh(); return }
    if (l.quote) data.value.quote = l.quote
    if (range.value === '1D' && l.quote?.live) void loadChart()
    if (isLatest.value) data.value.live = l.live
    data.value.review_running = l.review_running || (!l.mrp_set && data.value.ai_on)
  } catch { /* next tick */ }
}
onMounted(() => { poll = setInterval(tick, 15_000) })
onBeforeUnmount(() => { if (poll) clearInterval(poll) })

// The AI's review, and what the team can ask of it.
const rv = computed(() => data.value?.review?.review ?? null)
const driversBy = computed(() => (inp.value.drivers_by ?? (inp.value.drivers_edited ? 'team' : 'history')) as 'history' | 'ai' | 'team')
const STANCE: Record<string, string> = { positive: 'Positive', neutral: 'Neutral', cautious: 'Cautious', negative: 'Negative' }
const ai = reactive({ busy: false, msg: '' })
async function aiDo(action: 'review' | 'apply') {
  ai.busy = true; ai.msg = ''
  try { await $fetch('/api/markets/' + encodeURIComponent(sym.value) + '/ai', { method: 'POST', body: { action } }); if (action === 'apply') await refresh(); else { data.value.review_running = true; ai.msg = 'Reviewing now; this page updates when it is done (about a minute).' } }
  catch (e) { ai.msg = err(e) } finally { ai.busy = false }
}
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

// Watchlist and versions.
const msg = ref('')
const err = (e: unknown) => (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not save.'
async function toggleWatch() { msg.value = ''; try { await $fetch('/api/markets/watchlist', { method: 'POST', body: { symbol: sym.value, on: !data.value.watch } }); await refresh() } catch (e) { msg.value = err(e) } }
const pickVersion = (id: string) => router.replace({ query: { ...route.query, v: id === data.value?.latest_id ? undefined : id } })

// Edit drivers: growth and margin for each year, tax, net investment, working capital, long-run growth and the
// scenarios. Saved as a new version; the earlier versions stay.
const ed = reactive({ open: false, busy: false, msg: '', note: '', d: null as any })
function editDrivers() {
  const d = JSON.parse(JSON.stringify(v.value?.drivers ?? {}))
  d.scenarios ??= { bear: { growth: -3, margin: -2, wacc: 0.5 }, bull: { growth: 3, margin: 2, wacc: -0.5 }, p: [25, 50, 25] }
  Object.assign(ed, { open: true, busy: false, msg: '', note: '', d })
}
function resetDrivers() { const s = inp.value.drivers_seed; if (s) { ed.d.growth = [...s.growth]; ed.d.margin = [...s.margin]; ed.d.tax = s.tax; ed.d.reinvest = s.reinvest; ed.d.nwc = s.nwc; ed.d.terminal_growth = s.terminal_growth } }
async function saveDrivers() {
  ed.busy = true; ed.msg = ''
  const n = (x: unknown) => Number(x)
  const d = ed.d, body = { drivers: { growth: d.growth.map(n), margin: d.margin.map(n), tax: n(d.tax), reinvest: n(d.reinvest), nwc: n(d.nwc), terminal_growth: n(d.terminal_growth), scenarios: { bear: { growth: n(d.scenarios.bear.growth), margin: n(d.scenarios.bear.margin), wacc: n(d.scenarios.bear.wacc) }, bull: { growth: n(d.scenarios.bull.growth), margin: n(d.scenarios.bull.margin), wacc: n(d.scenarios.bull.wacc) }, p: d.scenarios.p.map(n) } }, note: ed.note || undefined }
  try { await $fetch('/api/markets/' + encodeURIComponent(sym.value) + '/value', { method: 'POST', body }); ed.open = false; await router.replace({ query: { ...route.query, v: undefined } }); await refresh() } catch (e) { ed.msg = err(e) } finally { ed.busy = false }
}

const tornadoMax = computed(() => Math.max(1, ...((r.value.tornado ?? []) as any[]).map((t) => Math.max(Math.abs((t.low ?? 0) - (sc.value?.base ?? 0)), Math.abs((t.high ?? 0) - (sc.value?.base ?? 0))))))
const bar = (val: number | null) => (val == null || sc.value?.base == null ? 0 : ((val - sc.value.base) / tornadoMax.value) * 50)
const SOURCES = computed(() => [inp.value.price?.source ? inp.value.price.source + ' prices' : null, inp.value.filings?.balance ? 'SEC EDGAR ' + inp.value.filings.balance.form + ' (' + day(inp.value.filings.balance.end) + ')' : null, inp.value.rf_long ? 'FRED DGS10 ' + day(inp.value.rf_long.d) : null, inp.value.mrp?.set ? 'market risk premium ' + fixed(inp.value.mrp.value, 2) + '% from ' + day(inp.value.mrp.effective_date) : null].filter(Boolean).join(' · '))
const TIP = {
  beta: 'How much the price tends to move with the market. 1 moves with it, below 1 less, above 1 more. Worked out from 60 months of returns against the S&P 500 (SPY).',
  re: 'The yearly return investors should expect for this stock\'s risk: the 10-year Treasury rate plus beta times the market risk premium (CAPM).',
  er: 'The yearly return if the price moves to the value over the horizon while the business earns its cost of equity.',
  wacc: 'Weighted average cost of capital: the blended return owed to shareholders and lenders, used to discount future cash flow.',
  mos: 'How far the price is below the value. A bigger gap leaves more room if our estimates are wrong.',
  tv: 'The value of all cash flow after year 10, assuming it grows at the long-run rate for ever.',
  r2: 'How much of the stock\'s monthly moves the market explains (0 to 1). Under 0.15 the beta is a loose fit.',
  implied: 'Reverse DCF: the one growth rate, every year for ten years at today\'s margins, that makes the value equal today\'s price.',
  be: 'The level of this driver at which the value would equal today\'s price.',
  reinvest: 'Capital spending less depreciation, as a share of revenue: what the business puts back in to grow.',
  nwc: 'Working capital (receivables and stock less payables) as a share of revenue; growing revenue ties up more of it.',
  mrp: 'The extra yearly return investors expect from stocks over Treasuries. Set by AI each month from its published source; an admin or GP can override it.',
  ai: 'Drivers chosen by the AI from the company\'s results, guidance and published consensus. The AI never does the valuation maths: the model works out every value from these inputs.'
}
</script>
<template>
  <section class="tk">
    <NuxtLink to="/markets" class="back">← Public markets</NuxtLink>
    <div v-if="error" class="card"><h1>{{ sym }}</h1><p class="error">{{ (error as any).data?.error?.message ?? (error as any).statusMessage ?? 'Could not load this symbol.' }}</p></div>
    <template v-else-if="data">
      <div class="hd">
        <div><p class="label">{{ data.instrument.exchange ? data.instrument.exchange + ' · ' : '' }}{{ data.instrument.symbol }}{{ data.instrument.sector ? ' · ' + data.instrument.sector : ' · ' + KIND[data.instrument.kind] }}</p>
          <h1>{{ data.instrument.name }}</h1>
          <div class="px"><b>{{ usd(price) }}</b><span v-if="data.live" class="sig" :class="data.live.signal">{{ data.live.label }}</span></div>
          <p class="chg"><span v-if="chg" :class="chg.abs >= 0 ? 'up' : 'dn'">{{ chg.abs >= 0 ? '▲' : '▼' }} {{ usd(Math.abs(chg.abs)) }} ({{ signed(chg.pct, 2) }}) {{ RLABEL[range] }}</span>
            <span class="mut"><i v-if="data.quote?.live" class="dotl" aria-hidden="true" />{{ data.quote?.live ? 'Live' : 'Last close' }} · {{ ptTime(data.quote?.as_of) }}</span></p></div>
        <div class="ac">
          <button class="btn secondary" @click="toggleWatch">{{ data.watch ? '★ Watching' : '☆ Watch' }}</button>
          <button v-if="v?.drivers && isLatest" class="btn secondary" @click="editDrivers">Override drivers</button>
          <select v-if="data.versions.length > 1" :value="v?.id" aria-label="Valuation version" @change="pickVersion(($event.target as HTMLSelectElement).value)"><option v-for="x in data.versions" :key="x.id" :value="x.id">v{{ x.version }} · {{ ptTime(x.created_at) }}{{ x.kind === 'edit' ? ' · team' : x.kind === 'ai' ? ' · AI' : '' }}</option></select>
        </div>
      </div>
      <p v-if="!isLatest" class="note">You are looking at an earlier version. <button class="lk" @click="pickVersion(data.latest_id)">Show the latest</button></p>
      <p v-if="msg" class="error">{{ msg }}</p>
      <p v-if="!data.mrp_set && data.instrument.kind === 'stock'" class="warn"><template v-if="data.ai_on">The AI is looking up this month's market risk premium; the value appears here in about a minute.</template><template v-else>The market risk premium is not set, so there is no value yet. <NuxtLink to="/markets/assumptions">Enter it in Assumptions</NuxtLink>.</template></p>
      <p v-if="rv?.thesis_break && isLatest" class="brk"><b>AI flag: the case for owning this may be broken.</b> {{ rv.thesis_break_why }}</p>

      <div class="card chart">
        <div class="ct"><nav class="rg" aria-label="Chart range"><button v-for="x in RANGES" :key="x" :class="{ on: range === x }" @click="range = x">{{ x }}</button></nav>
          <label v-if="sc" class="tg"><input v-model="showFair" type="checkbox"> Fair value</label></div>
        <PriceChart v-if="ch && ch.points.length > 1" :points="ch.points" :base="range === '1D' ? (data.quote?.prev_close ?? ch.base) : null" :refs="fairRefs" :band="fairBand" :dates="ch.intraday ? 'time' : 'day'" :height="260" />
        <p v-else class="mut empty">No prices for this range yet.</p>
      </div>

      <div class="duo">
        <div class="card val">
          <template v-if="sc">
            <p class="k">Fair value<InfoTip text="The probability-weighted value per share from the bear, base and bull cases. The AI chooses the forecast; the model does the maths." /></p>
            <div class="fvb"><b>{{ usd(sc.weighted) }}</b><span v-if="data.live" :class="data.live.mos >= 0 ? 'up' : 'dn'">{{ data.live.mos >= 0 ? 'Price ' + fixed(data.live.mos, 0) + '% below value' : 'Price ' + fixed(-data.live.mos, 0) + '% above value' }}</span></div>
            <FairRange :bear="sc.bear" :base="sc.base" :bull="sc.bull" :price="price ?? 0" />
          </template>
          <template v-else-if="r.ddm != null"><p class="k">Dividend model value</p><div class="fvb"><b>{{ usd(r.ddm) }}</b></div><p class="mut sm">A cross-check for banks and insurers, not a full value.</p></template>
          <template v-else><p class="k">{{ r.method === 'risk' ? 'Sized by risk' : r.method === 'etf' ? 'ETF' : 'Value' }}</p><p class="mut sm">{{ r.method === 'risk' ? 'Crypto has no cash flows, so no fair value: positions are sized by risk.' : r.method === 'etf' ? 'Used for allocation and rebalancing; no cash-flow value of its own.' : (warnings[0] ?? 'Not enough data yet.') }}</p></template>
          <div v-if="r.re != null && r.method !== 'risk'" class="rets">
            <div v-if="data.live"><span>Expected<InfoTip :text="TIP.er" /></span><i><u :style="{ width: retW(data.live.er) + '%' }" :class="{ neg: data.live.er < 0 }" /></i><b>{{ pct(data.live.er) }}</b></div>
            <div><span>Required<InfoTip :text="TIP.re" /></span><i><u class="req" :style="{ width: retW(r.re) + '%' }" /></i><b>{{ pct(r.re) }}</b></div>
            <p class="mut sm">A year, over {{ data.horizon }} years</p></div>
        </div>
        <div class="card stats">
          <p class="k">Key statistics</p>
          <dl>
            <div v-if="data.stats.market_cap"><dt>Market cap</dt><dd>{{ big(data.stats.market_cap) }}</dd></div>
            <div v-if="data.stats.pe"><dt>P/E</dt><dd>{{ fixed(data.stats.pe, 1) }}×</dd></div>
            <div v-if="data.stats.div_yield"><dt>Dividend yield</dt><dd>{{ pct(data.stats.div_yield, 2) }}</dd></div>
            <div><dt>Beta<InfoTip :text="TIP.beta" /></dt><dd>{{ data.stats.beta != null ? fixed(data.stats.beta, 2) : '—' }}</dd></div>
            <div v-if="data.stats.eps"><dt>EPS (FY{{ data.stats.fy }})</dt><dd>{{ usd(data.stats.eps) }}</dd></div>
            <div v-if="data.stats.revenue"><dt>Revenue (FY{{ data.stats.fy }})</dt><dd>{{ big(data.stats.revenue) }}</dd></div>
            <div v-if="r.re != null && r.method !== 'risk'"><dt>Cost of equity</dt><dd>{{ pct(r.re) }}</dd></div>
            <div v-if="r.risk?.vol_90 != null"><dt>Volatility (90 days)</dt><dd>{{ pct(r.risk.vol_90, 0) }}</dd></div>
            <div v-if="r52 != null" class="wide"><dt>52-week range</dt><dd class="r52"><span>{{ usd(data.stats.lo52) }}</span><i><u :style="{ left: r52 + '%' }" /></i><span>{{ usd(data.stats.hi52) }}</span></dd></div>
          </dl>
        </div>
      </div>

      <nav class="tabs" aria-label="Sections"><button v-for="[k, l] in TABS" :key="k" :class="{ on: tab === k }" @click="tab = k">{{ l }}<i v-if="k === 'ai' && data.review_running" class="dotl" aria-label="running" /></button></nav>

      <div v-if="tab === 'overview'" class="pane">
        <div v-if="rv" class="card aiq" role="button" tabindex="0" @click="tab = 'ai'" @keydown.enter="tab = 'ai'">
          <p class="hl"><span class="st" :class="rv.stance">{{ STANCE[rv.stance] }}</span>{{ rv.headline }}</p>
          <p v-if="rv.about" class="mut">{{ rv.about }}</p><span class="more">Read the AI review →</span></div>
        <div v-else-if="data.review_running" class="card aiq"><p class="mut"><i class="dotl" aria-hidden="true" />The AI is reviewing {{ data.instrument.name }}…</p></div>
        <div v-if="data.history.length > 1" class="card"><p class="k">The business over time <span class="mut">Revenue and operating margin, actual then forecast</span></p>
          <BarLine :rows="data.history" bar-name="Revenue" line-name="Operating margin" /></div>
        <div v-if="growthRows.length > 1" class="g2">
          <HBars title="What the price assumes" sub="Revenue growth a year" :rows="growthRows" unit="pct" />
          <HBars v-if="r.tornado" title="What moves the value most" sub="Value change for a small move in each" :rows="(r.tornado as any[]).slice(0, 4).map((t) => ({ label: t.label, value: t.swing, note: 'break-even ' + (t.break_even != null ? pct(t.break_even) : 'outside range') }))" unit="money" />
        </div>
        <ul v-if="warnings.length" class="wl"><li v-for="w in warnings" :key="w">{{ w }}</li></ul>
      </div>

      <div v-else-if="tab === 'valuation'" class="pane">
        <div class="g2">
          <Waterfall v-if="bridge" title="How the value is built" :sub="'÷ ' + fixed(inp.capital.shares / 1e9, 2) + 'bn shares = ' + usd(r.dcf.per_share) + ' a share'" :start="bridge.start" :steps="bridge.steps" :end-label="bridge.end" no-change />
          <HBars v-if="scenarioRows.length" title="Scenarios" sub="Value a share against today's price" :rows="scenarioRows" unit="money" :ref-line="price" ref-label="Today's price" />
        </div>
        <div v-if="fcfRows.length" class="card"><p class="k">Free cash flow forecast <span class="mut">Ten years at a {{ pct(r.wacc, 2) }} discount rate (WACC<InfoTip :text="TIP.wacc" />)</span></p><BarLine :rows="fcfRows" bar-name="Free cash flow" :height="170" /></div>
        <div v-if="r.tornado" class="card"><p class="k">Break-evens <span class="mut">Each driver moved down and up; the level where the value equals the price</span></p>
          <table data-nosearch class="table mini tor"><tbody><tr v-for="t in r.tornado" :key="t.key"><td>{{ t.label }}</td><td class="n">{{ pct(t.now) }}</td>
            <td class="bars"><span class="tb"><i class="lo" :style="{ left: 50 + Math.min(0, bar(t.low), bar(t.high)) + '%', width: Math.abs(bar(t.low) - bar(t.high)) + '%' }" /><i class="mid" /></span><em>{{ usd(t.low) }} → {{ usd(t.high) }}</em></td>
            <td class="n">{{ t.break_even != null ? pct(t.break_even) : '—' }}</td></tr></tbody></table></div>
        <details v-if="r.dcf" class="card"><summary>Show the math</summary>
          <div class="math">
            <p>Cost of equity = {{ pct(inp.rf_long?.value, 2) }} (10-year Treasury, {{ day(inp.rf_long?.d) }}) + {{ fixed(inp.beta_used, 2) }} × {{ pct(inp.mrp?.value, 2) }} (market risk premium<InfoTip :text="TIP.mrp" />) = <b>{{ pct(r.re, 2) }}</b></p>
            <p>WACC = {{ pct(r.re, 2) }} × {{ pct(inp.capital.equity_value / (inp.capital.equity_value + inp.capital.debt) * 100, 0) }} + {{ pct(inp.capital.rd, 2) }} × (1 − {{ pct(v.drivers.tax, 0) }}) × {{ pct(inp.capital.debt / (inp.capital.equity_value + inp.capital.debt) * 100, 0) }} = <b>{{ pct(r.wacc, 2) }}</b></p>
            <p>Enterprise value = {{ big(r.dcf.pv_fcf) }} + {{ big(r.dcf.pv_tv) }} after year 10<InfoTip :text="TIP.tv" /> = <b>{{ big(r.dcf.ev) }}</b>; equity {{ big(r.dcf.equity) }} ÷ {{ fixed(inp.capital.shares / 1e9, 3) }}bn shares = <b>{{ usd(r.dcf.per_share) }}</b></p>
            <div class="sx"><table data-nosearch class="table mini"><thead><tr><th>Year</th><th v-for="x in r.dcf.rows" :key="x.year" class="n">{{ x.year }}</th></tr></thead>
              <tbody><tr><td>Growth</td><td v-for="(g, k) in v.drivers.growth" :key="k" class="n">{{ pct(g) }}</td></tr><tr><td>Margin</td><td v-for="(g, k) in v.drivers.margin" :key="k" class="n">{{ pct(g) }}</td></tr>
                <tr><td>Revenue</td><td v-for="x in r.dcf.rows" :key="x.year" class="n">{{ big(x.revenue) }}</td></tr><tr class="tot"><td>Free cash flow</td><td v-for="x in r.dcf.rows" :key="x.year" class="n">{{ big(x.fcf) }}</td></tr></tbody></table></div>
            <p class="mut sm">Drivers {{ driversBy === 'ai' ? 'set by AI' : driversBy === 'team' ? 'set by the team' : "from the company's last three years" }} · tax {{ pct(v.drivers.tax) }} · net investment {{ pct(v.drivers.reinvest) }} of revenue · long-run growth {{ pct(v.drivers.terminal_growth) }}</p>
          </div></details>
      </div>

      <div v-else-if="tab === 'risk'" class="pane">
        <div class="g2">
          <div v-if="r.beta_points && inp.beta" class="card"><p class="k">Beta {{ fixed(inp.beta.beta, 2) }}<InfoTip :text="TIP.beta" /> <span class="mut">Monthly returns against SPY · R² {{ fixed(inp.beta.r2, 2) }}</span></p>
            <BetaScatter :points="r.beta_points" :beta="inp.beta.beta" :alpha="inp.beta.alpha" /></div>
          <div class="card"><p class="k">Falls from the high <span class="mut">Five years · worst {{ pct(r.risk?.drawdown_5y, 0) }}</span></p>
            <PriceChart v-if="drawdown.length > 2" :points="drawdown" unit="pct" :height="230" label="Fall from previous high" /></div>
        </div>
        <div class="tiles">
          <div class="card"><p class="k">Volatility, 30 days</p><b class="big">{{ pct(r.risk?.vol_30, 0) }}</b></div>
          <div class="card"><p class="k">Volatility, 90 days</p><b class="big">{{ pct(r.risk?.vol_90, 0) }}</b></div>
          <div class="card"><p class="k">Worst fall, 1 year</p><b class="big">{{ pct(r.risk?.drawdown_1y, 0) }}</b></div>
          <div v-if="r.crypto" class="card"><p class="k">Beta to Bitcoin</p><b class="big">{{ r.crypto.beta_btc != null ? fixed(r.crypto.beta_btc, 2) : '—' }}</b></div>
        </div>
      </div>

      <div v-else-if="tab === 'ai'" class="pane">
        <div class="card air">
          <div class="aih"><p class="k">AI review<span v-if="data.review" class="mut">{{ ptTime(data.review.created_at) }}{{ rv ? ' · ' + rv.confidence + ' confidence' : '' }}</span></p>
            <div class="row"><span v-if="data.review_running" class="mut sm"><i class="dotl" aria-hidden="true" />Reviewing…</span>
              <button v-if="rv?.drivers && driversBy === 'team'" class="btn secondary sm" :disabled="ai.busy" @click="aiDo('apply')">Use the AI's drivers</button>
              <button v-if="data.ai_on" class="btn secondary sm" :disabled="ai.busy || data.review_running" @click="aiDo('review')">Review again</button></div></div>
          <template v-if="rv">
            <p class="hl"><span class="st" :class="rv.stance">{{ STANCE[rv.stance] }}</span>{{ rv.headline }}</p>
            <p v-if="rv.about" class="mut">{{ rv.about }}</p>
            <p>{{ rv.thesis }}</p>
            <div class="g3c"><div v-if="rv.what_changed"><b>What changed</b><p>{{ rv.what_changed }}</p></div><div v-if="rv.guidance"><b>Guidance</b><p>{{ rv.guidance }}</p></div></div>
            <div class="g3c"><div v-if="rv.risks.length"><b>Risks</b><ul><li v-for="x in rv.risks" :key="x">{{ x }}</li></ul></div><div v-if="rv.catalysts.length"><b>Catalysts</b><ul><li v-for="x in rv.catalysts" :key="x">{{ x }}</li></ul></div></div>
            <div v-if="rv.drivers" class="drv"><b>Forecast the AI chose</b><InfoTip :text="TIP.ai" /><span v-if="driversBy === 'team'" class="mut"> (not in use: the team set its own)</span>
              <BarLine :rows="rv.drivers.growth.map((g: number, k: number) => ({ label: 'Y' + (k + 1), value: g, pct: rv.drivers.margin[k], forecast: true }))" bar-name="Revenue growth %" line-name="Operating margin %" :height="140" />
              <ul><li><b>Growth:</b> {{ rv.drivers.reasons.growth }}</li><li><b>Margin:</b> {{ rv.drivers.reasons.margin }}</li><li><b>Investment ({{ pct(rv.drivers.reinvest) }} of revenue):</b> {{ rv.drivers.reasons.investment }}</li></ul></div>
            <div v-if="rv.news.length" class="nw"><b>Recent news</b><ul><li v-for="n in rv.news" :key="n.url"><span class="mut">{{ n.date }}</span> <a :href="n.url" target="_blank" rel="noopener nofollow">{{ n.title }}</a></li></ul></div>
            <p v-if="rv.sources.length" class="mut sm">Read: <template v-for="(x, k) in rv.sources" :key="x.url"><a :href="x.url" target="_blank" rel="noopener nofollow">{{ host(x.url) }}</a>{{ k < rv.sources.length - 1 ? ' · ' : '' }}</template>. AI review ({{ data.review.model }}); a guide for the team, never sent to clients.</p>
          </template>
          <p v-else-if="!data.review_running" class="mut sm">{{ data.instrument.kind === 'stock' && !data.mrp_set ? 'The review starts once the market risk premium is in.' : 'No review yet.' }}</p>
          <p v-if="ai.msg" class="mut sm">{{ ai.msg }}</p>
        </div>
      </div>

      <p class="foot">Guide only, not a guarantee of returns or advice to any client. Sources: {{ SOURCES || '—' }}{{ v ? ' · model ' + v.model_version + ' · version ' + v.version : '' }}.</p>
    </template>
    <p v-else-if="pending" class="mut">Valuing {{ sym }}… the first time takes a few seconds while prices and filings are fetched.</p>

    <AppModal :open="ed.open" wide title="Override drivers" @close="ed.open = false">
      <form v-if="ed.d" id="edf" class="ef" @submit.prevent="saveDrivers">
        <p class="mut sm">Your drivers replace the AI's for this stock and are kept for later valuations; the AI keeps reviewing, and its drivers can be switched back on from the AI review. Saved as a new version; earlier versions stay.</p>
        <div class="sx"><table data-nosearch class="table mini"><thead><tr><th>Year</th><th v-for="k in 10" :key="k" class="n">{{ k }}</th></tr></thead>
          <tbody><tr><td>Growth %</td><td v-for="k in 10" :key="k"><input v-model.number="ed.d.growth[k - 1]" type="number" step="0.1" :aria-label="'Revenue growth year ' + k"></td></tr>
            <tr><td>Margin %</td><td v-for="k in 10" :key="k"><input v-model.number="ed.d.margin[k - 1]" type="number" step="0.1" :aria-label="'Operating margin year ' + k"></td></tr></tbody></table></div>
        <div class="g4"><label class="label">Tax rate %<input v-model.number="ed.d.tax" type="number" step="0.1"></label><label class="label">Net investment % of revenue<input v-model.number="ed.d.reinvest" type="number" step="0.1"></label>
          <label class="label">Working capital % of revenue<input v-model.number="ed.d.nwc" type="number" step="0.1"></label><label class="label">Long-run growth %<input v-model.number="ed.d.terminal_growth" type="number" step="0.1"></label></div>
        <p class="k">Scenarios <span class="mut">Points added to every year's growth and margin, and to the WACC</span></p>
        <div class="g4 mid"><span /><span class="label">Growth</span><span class="label">Margin</span><span class="label">WACC</span>
          <span class="label">Bear</span><input v-model.number="ed.d.scenarios.bear.growth" type="number" step="0.5" aria-label="Bear growth"><input v-model.number="ed.d.scenarios.bear.margin" type="number" step="0.5" aria-label="Bear margin"><input v-model.number="ed.d.scenarios.bear.wacc" type="number" step="0.1" aria-label="Bear WACC">
          <span class="label">Bull</span><input v-model.number="ed.d.scenarios.bull.growth" type="number" step="0.5" aria-label="Bull growth"><input v-model.number="ed.d.scenarios.bull.margin" type="number" step="0.5" aria-label="Bull margin"><input v-model.number="ed.d.scenarios.bull.wacc" type="number" step="0.1" aria-label="Bull WACC"></div>
        <div class="g4"><label class="label">Bear weight %<input v-model.number="ed.d.scenarios.p[0]" type="number" min="0" max="100"></label><label class="label">Base weight %<input v-model.number="ed.d.scenarios.p[1]" type="number" min="0" max="100"></label><label class="label">Bull weight %<input v-model.number="ed.d.scenarios.p[2]" type="number" min="0" max="100"></label></div>
        <label class="label">Why (kept with the version)<input v-model="ed.note" maxlength="500" placeholder="e.g. Guidance cut in the Q3 call"></label>
        <p v-if="ed.msg" class="error">{{ ed.msg }}</p>
      </form>
      <template #foot><button v-if="inp.drivers_seed" type="button" class="btn secondary" @click="resetDrivers">Back to the company's history</button><button type="button" class="btn secondary" @click="ed.open = false">Cancel</button><button class="btn" type="submit" form="edf" :disabled="ed.busy">{{ ed.busy ? 'Saving…' : 'Save as new version' }}</button></template>
    </AppModal>

  </section>
</template>
<style scoped>
.tk { display: flex; flex-direction: column; gap: 16px; } .back { font-size: 13px; color: var(--c-blue-deep); text-decoration: none; }
.hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 2px 0 8px; font-size: 32px; }
.px { display: flex; align-items: center; gap: 12px; } .px b { font-size: 34px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.chg { margin: 6px 0 0; display: flex; gap: 14px; flex-wrap: wrap; font-size: 14px; font-variant-numeric: tabular-nums; }
.ac { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .ac select { font: inherit; font-size: 13px; height: 36px; border: 1px solid var(--c-rule-strong); padding: 0 8px; background: #fff; }
.note { margin: 0; font-size: 13px; background: var(--c-paper-2); padding: 8px 12px; } .lk { background: none; border: 0; color: var(--c-blue-deep); font: inherit; cursor: pointer; text-decoration: underline; padding: 0; }
.warn { margin: 0; padding: 10px 14px; background: #fff6e6; color: #7a4a06; font-size: 13.5px; } .warn a { color: inherit; font-weight: 600; }
.brk { margin: 0; padding: 10px 14px; border: 1px solid var(--c-danger); color: var(--c-danger); font-size: 13.5px; background: #fff; }
.card { padding: 16px 18px; } .k { margin: 0 0 8px; font-size: 13px; color: var(--c-ink-soft); font-weight: 500; } .k .mut { font-weight: 400; margin-left: 6px; font-size: 12px; }
.chart { padding: 14px 18px 10px; } .ct { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.rg { display: flex; gap: 2px; } .rg button { font: inherit; font-size: 12.5px; font-weight: 500; border: 0; background: none; padding: 6px 10px; color: var(--c-muted); cursor: pointer; } .rg button.on { background: var(--c-paper-2); color: var(--c-ink); }
.tg { font-size: 12.5px; color: var(--c-muted); display: flex; gap: 6px; align-items: center; cursor: pointer; } .empty { padding: 60px 0; text-align: center; }
.duo { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 12px; }
.fvb { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; } .fvb b { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; } .fvb span { font-size: 13px; }
.rets { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; } .rets > div { display: grid; grid-template-columns: 92px 1fr 56px; gap: 10px; align-items: center; font-size: 13px; }
.rets i { display: block; height: 8px; background: var(--c-paper-2); position: relative; } .rets u { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c-blue-deep); } .rets u.req { background: #b9cfe2; } .rets u.neg { background: var(--c-danger); }
.rets b { text-align: right; font-variant-numeric: tabular-nums; }
.stats dl { margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px 16px; } .stats dt { font-size: 12px; color: var(--c-muted); margin-bottom: 3px; } .stats dd { margin: 0; font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
.stats .wide { grid-column: span 2; } .r52 { display: flex; align-items: center; gap: 8px; font-size: 13px !important; } .r52 i { flex: 1; height: 4px; background: var(--c-paper-2); position: relative; } .r52 u { position: absolute; top: -4px; width: 3px; height: 12px; background: var(--c-navy); transform: translateX(-1px); }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--c-rule); overflow-x: auto; } .tabs button { font: inherit; font-size: 14px; background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 12px; color: var(--c-muted); cursor: pointer; white-space: nowrap; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-ink); } .tabs .dotl { margin-left: 6px; }
.pane { display: flex; flex-direction: column; gap: 12px; } .g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.big { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; display: block; } .sm { font-size: 12.5px; margin: 2px 0 0; } .mut { color: var(--c-muted); }
.aiq { cursor: pointer; } .aiq p { margin: 0 0 6px; font-size: 14px; line-height: 1.5; } .more { font-size: 13px; color: var(--c-blue-deep); }
.hl { font-size: 16px !important; font-weight: 600; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.st { font-size: 11.5px; font-weight: 500; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); } .st.positive { background: var(--c-blue-deep); color: #fff; } .st.cautious { border: 1px solid var(--c-warn); color: var(--c-warn); background: none; } .st.negative { border: 1px solid var(--c-danger); color: var(--c-danger); background: none; }
.wl { margin: 0; padding: 10px 14px 10px 30px; background: var(--c-paper-3); font-size: 13px; color: var(--c-ink-soft); }
.mini { width: 100%; border-collapse: collapse; font-size: 13px; } .mini th, .mini td { padding: 7px 10px; border-top: 1px solid var(--c-line-soft); text-align: left; white-space: nowrap; } .mini .n { text-align: right; } .mini tr.tot td { font-weight: 600; } .sx { overflow-x: auto; }
.tor .bars { width: 40%; } .tb { position: relative; display: block; height: 10px; background: var(--c-paper-2); } .tb .lo { position: absolute; top: 0; bottom: 0; background: var(--c-blue); } .tb .mid { position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--c-ink); } .tor em { display: block; font-style: normal; font-size: 11.5px; color: var(--c-muted); margin-top: 3px; }
details summary { cursor: pointer; font-size: 13.5px; font-weight: 500; color: var(--c-blue-deep); } .math { margin-top: 10px; } .math p { margin: 0 0 8px; font-size: 14px; line-height: 1.6; font-variant-numeric: tabular-nums; }
.air p { margin: 0 0 10px; font-size: 14px; line-height: 1.55; } .aih { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; } .aih .k { margin: 0; } .air .row { display: flex; gap: 8px; align-items: center; } .btn.sm { height: 30px; font-size: 12.5px; }
.g3c { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13.5px; margin-bottom: 8px; } .g3c p { margin: 4px 0 0; font-size: 13.5px; } .g3c ul, .nw ul, .drv ul { margin: 4px 0 0; padding-left: 18px; } .g3c li, .nw li, .drv li { margin-bottom: 3px; }
.drv { background: var(--c-paper-3); padding: 12px 14px; margin: 4px 0 12px; font-size: 13.5px; } .nw { font-size: 13.5px; margin-bottom: 8px; } .nw a, .air .sm a { color: var(--c-blue-deep); }
.dotl { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--c-blue); margin-right: 5px; vertical-align: 1px; animation: pulse 1.4s ease-in-out infinite; } @keyframes pulse { 50% { opacity: .3 } }
.up { color: var(--c-blue-deep); } .dn { color: var(--c-danger); }
.sig { display: inline-block; font-size: 12.5px; font-weight: 500; padding: 4px 10px; border: 1px solid transparent; }
.sig.strong_buy, .sig.buy { background: var(--c-blue-deep); color: #fff; } .sig.hold { background: var(--c-paper-2); color: var(--c-ink-soft); } .sig.trim { border-color: var(--c-warn); color: var(--c-warn); } .sig.sell { border-color: var(--c-danger); color: var(--c-danger); }
.sig.strong_buy::before, .sig.buy::before { content: '↑ '; } .sig.trim::before, .sig.sell::before { content: '↓ '; }
.foot { font-size: 12px; color: var(--c-muted); margin: 0; } .error { color: var(--c-danger); margin: 0; }
.ef { display: flex; flex-direction: column; gap: 14px; } .ef input { font: inherit; font-size: 13.5px; height: 32px; border: 1px solid var(--c-rule-strong); padding: 0 6px; width: 100%; box-sizing: border-box; }
.ef td { padding: 4px 3px; } .ef td input { width: 58px; padding: 0 4px; } .ef input[type=number] { -moz-appearance: textfield; appearance: textfield; } .ef input::-webkit-inner-spin-button, .ef input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; } .ef .label { display: flex; flex-direction: column; gap: 4px; }
.g4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px 12px; align-items: end; } .g4.mid { align-items: center; }
@media (prefers-reduced-motion: reduce) { .dotl { animation: none; } }
@media (max-width: 1000px) { .duo, .g2 { grid-template-columns: 1fr; } .stats dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } .g4 { grid-template-columns: 1fr 1fr; } .g3c { grid-template-columns: 1fr; } }
</style>
