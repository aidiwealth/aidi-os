<script setup lang="ts">
// The group live board: a header with a live pulse and the clock, the big numbers, the panels (where the wealth is,
// net worth over 12 months, revenue by business, this week) and the market ticker. "tv" fills the screen and scales
// everything to it; "editing" lets you drag numbers and panels into a new order and hide or show each.
interface Mix { key: string; label: string; value: number }
export interface LbData { at: string; year_change_pct: number | null
  live: { nav: number; today: number; today_pct: number; cash: number; accounts: number; client_assets: number; venture: number; gold: { value: number; oz: number; today: number }; stocks: { value: number; today: number }; mix: Mix[] }
  books: { revenue: number; profit: number; margin: number | null; revenue_growth: number | null; books_to: string | null; by: { name: string; revenue: number }[] }
  trend: { d: string; v: number }[]; week: { tasks_done: number; tasks_total: number; finvry_new: number; occupancy: number | null }
  ticker: { key: string; name: string; value: number; unit: 'usd' | 'usd_oz' | 'pct'; change: number | null; change_unit: 'pct' | 'pts'; closed?: boolean }[] }
export interface LbLayout { numbers: { key: string; on: boolean }[]; panels: { key: string; on: boolean }[]; ticker: boolean }
const props = defineProps<{ data: LbData; layout: LbLayout; tv?: boolean; editing?: boolean; name?: string; numbers?: Record<string, string>; panels?: Record<string, string> }>()
const emit = defineEmits<{ 'update:layout': [l: LbLayout] }>()
const NUM: Record<string, string> = props.numbers ?? { net_worth: 'Group net worth', revenue: 'Revenue this year', profit: 'Profit this year', cash: 'Cash', client_assets: 'Client assets', venture: 'Venture portfolio', gold: 'Gold and silver', stocks: 'Stocks and ETFs', occupancy: 'Aidi Haven occupancy', tasks: 'Tasks done this week', finvry: 'New Finvry companies' }
const PAN: Record<string, string> = props.panels ?? { mix: 'Where the wealth is', trend: 'Net worth · 12 months', revenue_by: 'Revenue by business', week: 'This week' }

// Money, in full or short ($1.26M, $486k).
const full = (v: number) => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US')
const short = (v: number) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e9 ? s + '$' + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? s + '$' + Math.round(a / 1e3) + 'k' : s + '$' + Math.round(a).toLocaleString('en-US') }
const arrow = (v: number | null) => (v === null ? '' : v >= 0 ? '▲ ' : '▼ ')
const sign = (v: number) => (v >= 0 ? 'up' : 'dn')

// Numbers tween to their new value, and flash up or down when they change.
const shown = reactive<Record<string, number>>({}); const flash = reactive<Record<string, string>>({})
const target = computed<Record<string, number>>(() => { const d = props.data; return { net_worth: d.live.nav, revenue: d.books.revenue, profit: d.books.profit, cash: d.live.cash, client_assets: d.live.client_assets, venture: d.live.venture, gold: d.live.gold.value, stocks: d.live.stocks.value } })
let raf = 0
watch(target, (t, old) => {
  if (typeof window === 'undefined') { Object.assign(shown, t); return }
  const from = { ...shown }, start = performance.now()
  for (const k of Object.keys(t)) if (old && old[k] !== undefined && old[k] !== t[k]) { flash[k] = t[k]! > old[k]! ? 'fu' : 'fd'; setTimeout(() => { flash[k] = '' }, 1600) }
  cancelAnimationFrame(raf)
  const step = (now: number) => { const p = Math.min(1, (now - start) / 900), e = 1 - Math.pow(1 - p, 3); for (const k of Object.keys(t)) shown[k] = (from[k] ?? t[k]!) + (t[k]! - (from[k] ?? t[k]!)) * e; if (p < 1) raf = requestAnimationFrame(step) }
  raf = requestAnimationFrame(step)
}, { immediate: true })
onBeforeUnmount(() => cancelAnimationFrame(raf))

interface Tile { big: string; sub: string; cls?: string }
const tile = (k: string): Tile => {
  const d = props.data, v = shown[k] ?? target.value[k] ?? 0
  switch (k) {
    case 'net_worth': return { big: full(v), sub: arrow(d.live.today) + full(Math.abs(d.live.today)) + ' today (' + (d.live.today_pct >= 0 ? '+' : '') + d.live.today_pct.toFixed(2) + '%)' + (d.year_change_pct !== null ? ' · ' + arrow(d.year_change_pct) + Math.abs(d.year_change_pct) + '% this year' : ''), cls: sign(d.live.today) }
    case 'revenue': return { big: short(v), sub: d.books.revenue_growth !== null ? arrow(d.books.revenue_growth) + Math.abs(d.books.revenue_growth) + '% vs last year' : (d.books.books_to ? 'books to ' + monthName(d.books.books_to) : 'from the books'), cls: d.books.revenue_growth !== null ? sign(d.books.revenue_growth) : '' }
    case 'profit': return { big: short(v), sub: d.books.margin !== null ? d.books.margin + '% margin' : 'from the books' }
    case 'cash': return { big: short(v), sub: 'across ' + d.live.accounts + ' account' + (d.live.accounts === 1 ? '' : 's') }
    case 'client_assets': return { big: short(v), sub: 'Aidi Wealth' }
    case 'venture': return { big: short(v), sub: 'at latest valuations' }
    case 'gold': return { big: short(v), sub: d.live.gold.oz + ' oz · ' + arrow(d.live.gold.today) + short(Math.abs(d.live.gold.today)) + ' today', cls: sign(d.live.gold.today) }
    case 'stocks': return { big: short(v), sub: arrow(d.live.stocks.today) + short(Math.abs(d.live.stocks.today)) + ' today', cls: sign(d.live.stocks.today) }
    case 'occupancy': return { big: d.week.occupancy !== null ? d.week.occupancy + '%' : '—', sub: 'booked this month' }
    case 'tasks': return { big: d.week.tasks_done + ' of ' + d.week.tasks_total, sub: 'this week' }
    case 'finvry': return { big: String(d.week.finvry_new), sub: 'this month' }
  }
  return { big: '—', sub: '' }
}
const monthName = (m: string) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m.slice(5, 7)) - 1] ?? m

const nums = computed(() => props.layout.numbers.filter((n) => props.editing || n.on))
const pans = computed(() => props.layout.panels.filter((p) => props.editing || p.on))
// Up to six in one row (net worth a little wider); more wrap into rows.
const numCols = computed(() => (nums.value.length <= 6 ? nums.value.map((n) => (n.key === 'net_worth' ? '1.5fr' : '1fr')).join(' ') : 'repeat(auto-fill, minmax(210px, 1fr))'))
const wrapNums = computed(() => nums.value.length > 6)

// Donut: arcs of the wealth mix.
const COLORS = ['#0c1a2e', '#1c547d', '#2675b0', '#5fa8d3', '#9cc3de', '#c9dcea', '#e3edf5', '#b9cfe2']
const mixTotal = computed(() => props.data.live.mix.reduce((t, m) => t + m.value, 0))
const arcs = computed(() => {
  let a = -Math.PI / 2; const R = 100, r = 66, out: { d: string; c: string }[] = []
  props.data.live.mix.forEach((m, i) => {
    const sweep = mixTotal.value ? (2 * Math.PI * m.value) / mixTotal.value : 0, b = a + sweep - (props.data.live.mix.length > 1 ? 0.012 : 0)
    if (sweep > 0.002) { const p = (ang: number, rr: number) => [110 + rr * Math.cos(ang), 110 + rr * Math.sin(ang)]; const L = b - a > Math.PI ? 1 : 0, [x1, y1] = p(a, R), [x2, y2] = p(b, R), [x3, y3] = p(b, r), [x4, y4] = p(a, r)
      out.push({ d: `M${x1} ${y1} A${R} ${R} 0 ${L} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${L} 0 ${x4} ${y4} Z`, c: COLORS[i % COLORS.length]! }) }
    a += sweep
  })
  return out
})
// Trend: net worth line with today as a live dot.
const tr = computed(() => {
  const v = props.data.trend.map((p) => p.v); if (v.length < 2) return null
  const lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1, W = 1000, H = 300
  const xy = v.map((x, i) => [(i / (v.length - 1)) * W, H - ((x - (lo - pad)) / (hi + pad - (lo - pad))) * H] as [number, number])
  const line = xy.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
  return { line, area: '0,' + H + ' ' + line + ' ' + W + ',' + H, last: xy[xy.length - 1]!, change: v[v.length - 1]! - v[0]!, first: props.data.trend[0]!.d, hi, lo }
})
const byMax = computed(() => Math.max(1, ...props.data.books.by.map((b) => b.revenue)))

// Live pulse and clock (client only, so the server and browser agree).
const now = ref(0); let clk: ReturnType<typeof setInterval> | null = null
onMounted(() => { now.value = Date.now(); clk = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { if (clk) clearInterval(clk) })
const ago = computed(() => { if (!now.value) return ''; const s = Math.max(0, Math.round((now.value - Date.parse(props.data.at)) / 1000)); return s < 60 ? s + ' second' + (s === 1 ? '' : 's') + ' ago' : Math.round(s / 60) + ' min ago' })
const clock = computed(() => (now.value ? new Date(now.value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''))
const day = computed(() => (now.value ? new Date(now.value).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''))
// The ticker, written like the Wealth pages' market strip.
const tick = (t: LbData['ticker'][number]) => (t.unit === 'pct' ? t.value.toFixed(2) + '%' : '$' + (t.value >= 1000 ? Math.round(t.value).toLocaleString('en-US') : t.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + (t.unit === 'usd_oz' ? '/oz' : ''))
const tchg = (t: LbData['ticker'][number]) => (t.change === null ? '' : t.change === 0 ? 'Unchanged' : (t.change > 0 ? '▲ ' : '▼ ') + Math.abs(t.change).toFixed(2) + (t.change_unit === 'pct' ? '%' : ' pts'))
const tdir = (t: LbData['ticker'][number]) => (t.change === null || t.change === 0 ? 'flat' : t.change > 0 ? 'up' : 'dn')
const tickAt = computed(() => (now.value ? new Date(props.data.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''))

// Editing: drag to reorder within numbers or panels; the eye hides or shows.
const drag = ref<{ zone: 'numbers' | 'panels'; key: string } | null>(null); const over = ref('')
function drop(zone: 'numbers' | 'panels', key: string) {
  const d = drag.value; drag.value = null; over.value = ''
  if (!d || d.zone !== zone || d.key === key) return
  const list = [...props.layout[zone]], from = list.findIndex((x) => x.key === d.key), to = list.findIndex((x) => x.key === key)
  const [it] = list.splice(from, 1); list.splice(to, 0, it!)
  emit('update:layout', { ...props.layout, [zone]: list })
}
const toggle = (zone: 'numbers' | 'panels', key: string) => emit('update:layout', { ...props.layout, [zone]: props.layout[zone].map((x) => (x.key === key ? { ...x, on: !x.on } : x)) })
</script>
<template>
  <div class="lb" :class="{ tv, editing }">
    <header class="hd"><div class="nm"><b>{{ name ?? 'The Aidi Group' }}</b><span class="live"><i />Live<template v-if="ago"> · updated {{ ago }}</template></span></div><div class="ck"><b>{{ clock }}</b><span>{{ day }}</span></div></header>
    <div class="nums" :class="{ wrap: wrapNums }" :style="{ gridTemplateColumns: numCols }">
      <div v-for="n in nums" :key="n.key" class="kc" :class="{ hero: n.key === 'net_worth', off: !n.on, over: over === 'n:' + n.key, [flash[n.key] ?? '']: true }"
        :draggable="editing" @dragstart="drag = { zone: 'numbers', key: n.key }" @dragover.prevent="over = 'n:' + n.key" @dragleave="over = ''" @drop.prevent="drop('numbers', n.key)" @dragend="drag = null; over = ''">
        <div v-if="editing" class="ed"><span class="gr" aria-hidden="true">⠿ Drag</span><button type="button" class="eye" :aria-label="(n.on ? 'Hide ' : 'Show ') + NUM[n.key]" @click="toggle('numbers', n.key)">{{ n.on ? 'Hide' : 'Show' }}</button></div>
        <span class="lab">{{ NUM[n.key] }}</span><b class="big">{{ tile(n.key).big }}</b><em :class="tile(n.key).cls">{{ tile(n.key).sub }}</em>
      </div>
    </div>
    <div class="pans">
      <section v-for="p in pans" :key="p.key" class="pc" :class="['p-' + p.key, { off: !p.on, over: over === 'p:' + p.key }]"
        :draggable="editing" @dragstart="drag = { zone: 'panels', key: p.key }" @dragover.prevent="over = 'p:' + p.key" @dragleave="over = ''" @drop.prevent="drop('panels', p.key)" @dragend="drag = null; over = ''">
        <div v-if="editing" class="ed"><span class="gr" aria-hidden="true">⠿ Drag</span><button type="button" class="eye" :aria-label="(p.on ? 'Hide ' : 'Show ') + PAN[p.key]" @click="toggle('panels', p.key)">{{ p.on ? 'Hide' : 'Show' }}</button></div>
        <template v-if="p.key === 'mix'"><h3>{{ PAN.mix }}</h3>
          <div class="dnut"><svg viewBox="0 0 220 220" role="img" aria-label="Where the wealth is"><path v-for="(a, i) in arcs" :key="i" :d="a.d" :fill="a.c" /></svg><div class="dc"><span>Total</span><b>{{ short(mixTotal) }}</b></div></div>
          <div class="leg"><div v-for="(m, i) in data.live.mix" :key="m.key"><i :style="{ background: COLORS[i % COLORS.length] }" /><span>{{ m.label }}</span><b>{{ short(m.value) }}</b><em>{{ mixTotal ? Math.round((m.value / mixTotal) * 100) : 0 }}%</em></div></div></template>
        <template v-else-if="p.key === 'trend'"><div class="ph"><h3>{{ PAN.trend }}</h3><span v-if="tr" :class="sign(tr.change)">{{ arrow(tr.change) }}{{ short(Math.abs(tr.change)) }}</span></div>
          <div v-if="tr" class="tw"><svg class="tl" viewBox="0 0 1000 300" preserveAspectRatio="none" role="img" aria-label="Net worth over 12 months"><polygon :points="tr.area" fill="#1c547d" fill-opacity=".08" /><polyline :points="tr.line" fill="none" stroke="#1c547d" stroke-width="3" vector-effect="non-scaling-stroke" /></svg>
          <div class="dot" :style="{ left: tr.last[0] / 10 + '%', top: tr.last[1] / 3 + '%' }" /><span class="yl hi">{{ short(tr.hi) }}</span><span class="yl lo">{{ short(tr.lo) }}</span></div>
          <div v-if="tr" class="ax"><span>{{ monthName(tr.first).slice(0, 3) }} {{ tr.first.slice(0, 4) }}</span><span>Today</span></div><p v-else class="mut">Not enough history yet.</p></template>
        <template v-else-if="p.key === 'revenue_by'"><h3>{{ PAN.revenue_by }} · this year</h3>
          <div v-for="b in data.books.by" :key="b.name" class="bz"><span>{{ b.name }}</span><div class="bb"><i :style="{ width: (b.revenue / byMax) * 100 + '%' }" /></div><b>{{ short(b.revenue) }}</b></div>
          <p v-if="!data.books.by.length" class="mut">No figures in the books yet this year.</p><p v-else-if="data.books.books_to" class="mut sm">Books to {{ monthName(data.books.books_to) }}</p></template>
        <template v-else-if="p.key === 'week'"><h3>{{ PAN.week }}</h3>
          <div class="wk"><div><span>Tasks done</span><b>{{ data.week.tasks_done }} of {{ data.week.tasks_total }}</b></div><div><span>New Finvry companies</span><b>{{ data.week.finvry_new }}</b><em>this month</em></div>
            <div><span>Aidi Haven occupancy</span><b>{{ data.week.occupancy !== null ? data.week.occupancy + '%' : '—' }}</b><em>this month</em></div><div><span>Gold held</span><b>{{ data.live.gold.oz }} oz</b><em :class="sign(data.live.gold.today)">{{ arrow(data.live.gold.today) }}{{ short(Math.abs(data.live.gold.today)) }} today</em></div></div></template>
      </section>
    </div>
    <div v-if="layout.ticker || editing" class="tk" :class="{ off: !layout.ticker }">
      <div class="tlv"><i aria-hidden="true" />Live<template v-if="tickAt"> · {{ tickAt }}</template></div>
      <div class="vp"><div class="tr" :class="{ still: data.ticker.length < 4 }"><template v-for="n in (data.ticker.length < 4 ? 1 : 2)" :key="n">
        <span v-for="t in data.ticker" :key="n + t.key" class="it" :aria-hidden="n === 2 ? 'true' : undefined"><span class="tn">{{ t.name }}</span><span class="tv">{{ tick(t) }}</span><span v-if="tchg(t)" class="tc" :class="tdir(t)">{{ tchg(t) }}</span></span>
      </template></div></div>
      <button v-if="editing" type="button" class="eye tke" @click="emit('update:layout', { ...layout, ticker: !layout.ticker })">{{ layout.ticker ? 'Hide ticker' : 'Show ticker' }}</button></div>
  </div>
</template>
<style scoped>
.lb { background: #f6f6f3; display: flex; flex-direction: column; gap: 14px; padding: 22px; color: var(--c-ink); --big: 38px; --hero: 52px; --lab: 14px; --sub: 14px; }
.lb.tv { position: fixed; top: 0; left: 0; right: 0; z-index: 2000; height: var(--vh100, 100vh); padding: 2.6vh 2.2vw; gap: 1.6vh; box-sizing: border-box; overflow: hidden; --big: clamp(28px, 4.2vh, 64px); --hero: clamp(36px, 6vh, 96px); --lab: clamp(13px, 1.45vh, 22px); --sub: clamp(13px, 1.45vh, 22px); }
.hd { display: flex; justify-content: space-between; align-items: center; } .nm { display: flex; align-items: center; gap: 16px; } .nm b { font-size: calc(var(--lab) * 1.75); letter-spacing: -.01em; }
.live { display: inline-flex; align-items: center; gap: 8px; font-size: var(--sub); color: var(--c-blue-deep); } .live i { width: 9px; height: 9px; border-radius: 50%; background: #2675b0; animation: pulse 2s infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(38, 117, 176, .45); } 70% { box-shadow: 0 0 0 9px rgba(38, 117, 176, 0); } 100% { box-shadow: 0 0 0 0 rgba(38, 117, 176, 0); } }
.ck { text-align: right; } .ck b { display: block; font-size: calc(var(--lab) * 1.75); } .ck span { font-size: var(--sub); color: var(--c-muted); }
.nums { display: grid; gap: 14px; } .nums.wrap .hero { grid-column: span 2; }
.kc, .pc { background: #fff; border: 1px solid var(--c-rule); position: relative; transition: background .4s, opacity .2s, border-color .15s; }
.kc { padding: 20px 22px; display: flex; flex-direction: column; gap: 6px; min-width: 0; } .lab { font-size: var(--lab); color: var(--c-muted); }
.big { font-size: var(--big); font-weight: 600; letter-spacing: -.025em; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .hero .big { font-size: var(--hero); color: var(--c-navy); }
.kc em { font-style: normal; font-size: var(--sub); color: var(--c-ink-soft); } .up { color: var(--c-blue-deep) !important; } .dn { color: var(--c-danger) !important; }
.kc.fu { background: #eef4f9; } .kc.fd { background: #fbf0ef; }
.pans { display: flex; gap: 14px; flex: 1; min-height: 0; } .pc { flex: 1 1 0; padding: 20px 22px; min-width: 0; display: flex; flex-direction: column; } .pc.p-trend { flex-grow: 1.5; }
.pc h3 { margin: 0 0 12px; font-size: calc(var(--lab) * 1.15); font-weight: 600; } .ph { display: flex; justify-content: space-between; align-items: baseline; } .ph span { font-size: var(--sub); }
.dnut { position: relative; width: min(220px, 100%); aspect-ratio: 1; margin: 0 auto 14px; } .lb.tv .dnut { width: min(26vh, 100%); } .dnut svg { width: 100%; height: 100%; } .dc { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; } .dc span { font-size: 12.5px; color: var(--c-muted); } .dc b { font-size: calc(var(--lab) * 1.6); }
.leg { display: flex; flex-direction: column; gap: 8px; font-size: var(--sub); } .leg div { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto 46px; gap: 10px; align-items: center; } .leg i { width: 12px; height: 12px; } .leg em { font-style: normal; color: var(--c-muted); text-align: right; font-size: .9em; }
.tw { position: relative; flex: 1; min-height: 160px; display: flex; } .tl { width: 100%; height: 100%; min-height: 160px; display: block; }
.dot { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #2675b0; border: 3px solid #fff; animation: pulse 2s infinite; pointer-events: none; }
.yl { position: absolute; left: 0; font-size: 12px; color: var(--c-muted); background: rgba(255, 255, 255, .8); padding: 0 4px; } .yl.hi { top: 4%; } .yl.lo { bottom: 4%; }
.ax { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--c-muted); margin-top: 6px; }
.bz { display: grid; grid-template-columns: minmax(0, 140px) minmax(0, 1fr) 80px; gap: 12px; align-items: center; font-size: var(--sub); padding: 9px 0; border-top: 1px solid var(--c-rule); } .bz span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .bz b { text-align: right; }
.bb { height: 12px; background: var(--c-paper-2); } .bb i { display: block; height: 100%; background: var(--c-blue-deep); transition: width .8s; }
.wk { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .wk div { background: var(--c-paper-3); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; } .wk span { font-size: 12.5px; color: var(--c-muted); } .wk b { font-size: calc(var(--big) * .6); font-weight: 600; } .wk em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.mut { color: var(--c-muted); font-size: var(--sub); } .sm { font-size: 12.5px; margin: 10px 0 0; }
.tk { display: flex; align-items: stretch; background: #fff; border: 1px solid var(--c-rule); overflow: hidden; position: relative; }
.tlv { display: flex; align-items: center; gap: 8px; padding: 0 18px; border-right: 1px solid var(--c-rule); font-size: var(--sub); color: var(--c-blue-deep); white-space: nowrap; } .tlv i { width: 8px; height: 8px; background: var(--c-blue); border-radius: 50%; }
.vp { flex: 1; min-width: 0; overflow: hidden; }
.tr { display: flex; gap: 40px; width: max-content; padding: 14px 20px; white-space: nowrap; font-size: calc(var(--sub) * 1.1); animation: scroll 60s linear infinite; } .tr.still { animation: none; }
.it { display: inline-flex; gap: 10px; align-items: baseline; } .tn { color: var(--c-muted); } .tv { font-weight: 600; font-variant-numeric: tabular-nums; } .tc { font-variant-numeric: tabular-nums; } .tc.up { color: var(--c-blue-deep); } .tc.dn { color: var(--c-danger); } .tc.flat { color: var(--c-muted); }
@keyframes scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.lb:not(.tv) .tk:hover .tr { animation-play-state: paused; }
/* Editing */
.editing .kc, .editing .pc { cursor: grab; } .editing .off { opacity: .4; } .editing .over { border-color: var(--c-blue-deep); box-shadow: inset 0 0 0 2px var(--c-blue-deep); }
.ed { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin: -8px -8px 6px; padding-bottom: 6px; border-bottom: 1px dashed var(--c-rule-strong); } .gr { color: var(--c-muted); font-size: 12px; cursor: grab; letter-spacing: .02em; }
.eye { font: inherit; font-size: 12px; padding: 3px 9px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; } .eye:hover { border-color: var(--c-navy); }
.tke { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); }
@media (max-width: 1100px) { .lb:not(.tv) .nums { grid-template-columns: 1fr 1fr !important; } .lb:not(.tv) .hero { grid-column: span 2; } .lb:not(.tv) .pans { flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .tr, .live i, .dot { animation: none; } }
</style>
