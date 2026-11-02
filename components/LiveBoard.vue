<script setup lang="ts">
// The group live board: a header with a live pulse and the clock, the big numbers, the panels (where the wealth is,
// net worth over 12 months, revenue by business, this week) and the market ticker. "tv" fills the screen and scales
// everything to it; "editing" lets you drag numbers and panels into a new order and hide or show each.
interface Mix { key: string; label: string; value: number }
export interface LbData { at: string; year_change_pct: number | null
  live: { nav: number; today: number; today_pct: number; cash: number; accounts: number; client_assets: number; venture: number; venture_cost: number; venture_count: number; gold: { value: number; oz: number; today: number }; stocks: { value: number; today: number }; mix: Mix[] }
  books: { revenue: number; profit: number; margin: number | null; revenue_growth: number | null; books_to: string | null; by: { name: string; revenue: number }[] }
  trend: { d: string; v: number }[]; week: { tasks_done: number; tasks_total: number; finvry_new: number; occupancy: number | null }
  ticker: { key: string; name: string; value: number; unit: 'usd' | 'usd_oz' | 'pct'; change: number | null; change_unit: 'pct' | 'pts'; closed?: boolean }[] }
export interface LbLayout { numbers: { key: string; on: boolean }[]; panels: { key: string; on: boolean }[]; ticker: boolean }
const props = defineProps<{ data: LbData; layout: LbLayout; tv?: boolean; editing?: boolean; name?: string; numbers?: Record<string, string>; panels?: Record<string, string> }>()
const emit = defineEmits<{ 'update:layout': [l: LbLayout] }>()
const NUM: Record<string, string> = props.numbers ?? { net_worth: 'Group net worth', revenue: 'Revenue this year', profit: 'Profit this year', cash: 'Cash', client_assets: 'Client assets', venture: 'Portfolio allocation', gold: 'Gold and silver', stocks: 'Stocks and ETFs', occupancy: 'Aidi Haven occupancy', tasks: 'Tasks done this week', finvry: 'New Finvry companies' }
const PAN: Record<string, string> = props.panels ?? { mix: 'Where the wealth is', trend: 'Net worth · 12 months', revenue_by: 'Revenue by business', revenue_mix: 'Revenue by company', week: 'This week' }

// Money, in full or short ($1.26M, $486k).
const full = (v: number) => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US')
const short = (v: number) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e9 ? s + '$' + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? s + '$' + Math.round(a / 1e3) + 'k' : s + '$' + Math.round(a).toLocaleString('en-US') }
const arrow = (v: number | null) => (v === null ? '' : v >= 0 ? '▲ ' : '▼ ')
const sign = (v: number) => (v >= 0 ? 'up' : 'dn')

// Numbers tween to their new value, and flash up or down when they change.
const shown = reactive<Record<string, number>>({}); const flash = reactive<Record<string, string>>({})
const target = computed<Record<string, number>>(() => { const d = props.data; return { net_worth: d.live.nav, revenue: d.books.revenue, profit: d.books.profit, cash: d.live.cash, client_assets: d.live.client_assets, venture: d.live.venture_cost, gold: d.live.gold.value, stocks: d.live.stocks.value } })
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
    case 'venture': return { big: short(v), sub: 'in ' + d.live.venture_count + ' compan' + (d.live.venture_count === 1 ? 'y' : 'ies') + ' · worth ' + short(d.live.venture) + ' now', cls: sign(d.live.venture - d.live.venture_cost) }
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

const COLORS = ['#0c1a2e', '#1c547d', '#2675b0', '#5fa8d3', '#9cc3de', '#c9dcea', '#e3edf5', '#b9cfe2']
// Donuts: arcs for a list of parts (the wealth mix; revenue by company).
function arcsOf(list: { value: number }[]) {
  const total = list.reduce((t, m) => t + Math.max(0, m.value), 0); let a = -Math.PI / 2; const R = 100, r = 64, out: { d: string; c: string }[] = []
  list.forEach((m, i) => {
    const sweep = total ? (2 * Math.PI * Math.max(0, m.value)) / total : 0, b = a + sweep - (list.length > 1 ? 0.012 : 0)
    // A single part is the whole ring (an arc from a point to itself draws nothing).
    if (sweep >= 2 * Math.PI - 0.001) out.push({ d: 'M10 110 A100 100 0 1 1 210 110 A100 100 0 1 1 10 110 Z M46 110 A64 64 0 1 0 174 110 A64 64 0 1 0 46 110 Z', c: COLORS[i % COLORS.length]! })
    else if (sweep > 0.002) { const p = (ang: number, rr: number) => [110 + rr * Math.cos(ang), 110 + rr * Math.sin(ang)]; const L = b - a > Math.PI ? 1 : 0, [x1, y1] = p(a, R), [x2, y2] = p(b, R), [x3, y3] = p(b, r), [x4, y4] = p(a, r)
      out.push({ d: `M${x1} ${y1} A${R} ${R} 0 ${L} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${L} 0 ${x4} ${y4} Z`, c: COLORS[i % COLORS.length]! }) }
    a += sweep
  })
  return { arcs: out, total }
}
const mixD = computed(() => arcsOf(props.data.live.mix))
const revD = computed(() => arcsOf(props.data.books.by.map((b) => ({ value: b.revenue }))))
// Trend: net worth line with today as a live dot.
const tr = computed(() => {
  const pts = props.data.trend, v = pts.map((p) => p.v); if (v.length < 2) return null
  const lo0 = Math.min(...v), hi0 = Math.max(...v), span = hi0 - lo0 || Math.abs(hi0) * 0.05 || 1
  const lo = lo0 - span * 0.15, hi = hi0 + span * 0.15, W = 1000, H = 300
  const xy = v.map((x, i) => [(i / (v.length - 1)) * W, H - ((x - lo) / (hi - lo)) * H] as [number, number])
  // A smooth line that never overshoots the figures (monotone cubic, Fritsch–Carlson).
  const n = xy.length, dx = xy.map((p, i) => (i < n - 1 ? xy[i + 1]![0] - p[0] : 0)), sl = xy.map((p, i) => (i < n - 1 ? (xy[i + 1]![1] - p[1]) / dx[i]! : 0))
  const m = xy.map((_, i) => (i === 0 ? sl[0]! : i === n - 1 ? sl[n - 2]! : sl[i - 1]! * sl[i]! <= 0 ? 0 : (sl[i - 1]! + sl[i]!) / 2))
  for (let i = 0; i < n - 1; i++) { if (sl[i] === 0) { m[i] = 0; m[i + 1] = 0; continue } const a = m[i]! / sl[i]!, b = m[i + 1]! / sl[i]!, h = a * a + b * b; if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * sl[i]!; m[i + 1] = t * b * sl[i]! } }
  let d = 'M' + xy[0]![0].toFixed(1) + ',' + xy[0]![1].toFixed(1)
  for (let i = 0; i < n - 1; i++) { const h = dx[i]! / 3, p1 = xy[i]!, p2 = xy[i + 1]!; d += ' C' + (p1[0] + h).toFixed(1) + ',' + (p1[1] + m[i]! * h).toFixed(1) + ' ' + (p2[0] - h).toFixed(1) + ',' + (p2[1] - m[i + 1]! * h).toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1) }
  const grid = [0.25, 0.5, 0.75].map((f) => ({ y: f * 100, v: hi - f * (hi - lo) }))
  const months = pts.map((p, i) => ({ x: (i / (pts.length - 1)) * 100, l: i === pts.length - 1 ? 'Today' : monthName(p.d).slice(0, 3) })).filter((_, i) => i % 2 === 0 || i === pts.length - 1)
  return { d, area: d + ' L' + W + ',' + H + ' L0,' + H + ' Z', last: xy[xy.length - 1]!, change: v[v.length - 1]! - v[0]!, grid, months, now: v[v.length - 1]! }
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
          <div class="dwrap"><div class="dnut"><svg viewBox="0 0 220 220" role="img" aria-label="Where the wealth is"><path v-for="(a, i) in mixD.arcs" :key="i" :d="a.d" :fill="a.c" /></svg><div class="dc"><span>Total</span><b>{{ short(mixD.total) }}</b></div></div>
          <div class="leg"><div v-for="(m, i) in data.live.mix" :key="m.key"><i :style="{ background: COLORS[i % COLORS.length] }" /><span>{{ m.label }}</span><b>{{ short(m.value) }}</b><em>{{ mixD.total ? Math.round((m.value / mixD.total) * 100) : 0 }}%</em></div></div></div></template>
        <template v-else-if="p.key === 'revenue_mix'"><h3>{{ PAN.revenue_mix }} <small>this year</small></h3>
          <div v-if="data.books.by.length" class="dwrap"><div class="dnut"><svg viewBox="0 0 220 220" role="img" aria-label="Revenue by company"><path v-for="(a, i) in revD.arcs" :key="i" :d="a.d" :fill="a.c" /></svg><div class="dc"><span>Revenue</span><b>{{ short(revD.total) }}</b></div></div>
          <div class="leg"><div v-for="(b, i) in data.books.by" :key="b.name"><i :style="{ background: COLORS[i % COLORS.length] }" /><span>{{ b.name }}</span><b>{{ short(b.revenue) }}</b><em>{{ revD.total ? Math.round((b.revenue / revD.total) * 100) : 0 }}%</em></div></div></div>
          <p v-else class="mut">No figures in the books yet this year.</p></template>
        <template v-else-if="p.key === 'trend'"><div class="ph"><h3>{{ PAN.trend }}</h3><span v-if="tr" :class="sign(tr.change)">{{ arrow(tr.change) }}{{ short(Math.abs(tr.change)) }}</span></div>
          <div v-if="tr" class="tw"><svg class="tl" viewBox="0 0 1000 300" preserveAspectRatio="none" role="img" aria-label="Net worth over 12 months">
            <defs><linearGradient id="lbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2675b0" stop-opacity=".22" /><stop offset="1" stop-color="#2675b0" stop-opacity="0" /></linearGradient></defs>
            <line v-for="g in tr.grid" :key="g.y" x1="0" x2="1000" :y1="g.y * 3" :y2="g.y * 3" stroke="#0f1115" stroke-opacity=".07" stroke-dasharray="4 6" vector-effect="non-scaling-stroke" />
            <path :d="tr.area" fill="url(#lbg)" /><path :d="tr.d" fill="none" stroke="#1c547d" stroke-width="3.5" stroke-linecap="round" vector-effect="non-scaling-stroke" /></svg>
            <span v-for="g in tr.grid" :key="'l' + g.y" class="yl" :style="{ top: g.y + '%' }">{{ short(g.v) }}</span>
            <div class="dot" :style="{ left: tr.last[0] / 10 + '%', top: tr.last[1] / 3 + '%' }" /><span class="nowl" :style="{ top: tr.last[1] / 3 + '%' }">{{ short(tr.now) }}</span></div>
          <div v-if="tr" class="ax"><span v-for="m in tr.months" :key="m.x" :style="{ left: m.x + '%' }">{{ m.l }}</span></div><p v-else class="mut">Not enough history yet.</p></template>
        <template v-else-if="p.key === 'revenue_by'"><h3>{{ PAN.revenue_by }} <small>this year</small></h3>
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
.lb { background: #f6f6f3; display: flex; flex-direction: column; gap: 14px; padding: 22px; color: var(--c-ink); --big: 38px; --hero: 52px; --lab: 14px; --sub: 14px; --sm: 12.5px; }
.lb.tv { position: fixed; top: 0; left: 0; right: 0; z-index: 2000; height: var(--vh100, 100vh); padding: 2.6vh 2.2vw; gap: 1.6vh; box-sizing: border-box; overflow: hidden; --big: clamp(34px, 3.5vw, 120px); --hero: clamp(44px, 4.7vw, 160px); --lab: clamp(16px, 1.3vw, 40px); --sub: clamp(15px, 1.15vw, 36px); --sm: clamp(13px, .95vw, 30px); }
/* On the TV, read from across the room: bigger padding, charts and legends. */
.lb.tv .kc, .lb.tv .pc { padding: 1.5vw 1.6vw; } .lb.tv .nums, .lb.tv .pans { gap: 1vw; } .lb.tv .live i { width: .7vw; height: .7vw; min-width: 9px; min-height: 9px; }
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
.pc h3 { margin: 0 0 .8em; font-size: calc(var(--lab) * 1.15); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .pc h3 small { font-size: var(--sm); font-weight: 400; color: var(--c-muted); margin-left: .3em; } .ph { display: flex; justify-content: space-between; align-items: baseline; } .ph span { font-size: var(--sub); }
.dwrap { display: flex; flex-direction: column; flex: 1; min-height: 0; } .dnut { position: relative; width: min(220px, 100%); aspect-ratio: 1; margin: 0 auto 14px; } .lb.tv .dnut { width: min(32vh, 92%); margin-bottom: 1.4vw; } .dnut svg { width: 100%; height: 100%; } .dc { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; } .dc span { font-size: var(--sm); color: var(--c-muted); } .dc b { font-size: calc(var(--big) * .62); font-weight: 600; letter-spacing: -.02em; }
.leg { display: flex; flex-direction: column; gap: .55em; font-size: var(--sub); } .leg div { display: grid; grid-template-columns: .8em minmax(0, 1fr) auto 3em; gap: .6em; align-items: center; } .leg span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .leg i { width: .8em; height: .8em; } .leg em { font-style: normal; color: var(--c-muted); text-align: right; font-size: .9em; }
.tw { position: relative; flex: 1; min-height: 160px; display: flex; margin-left: 4.2em; font-size: var(--sm); } .tl { width: 100%; height: 100%; min-height: 160px; display: block; overflow: visible; }
.dot { position: absolute; width: 1.15em; height: 1.15em; margin: -.575em 0 0 -.575em; font-size: var(--sub); border-radius: 50%; background: #2675b0; border: 3px solid #fff; animation: pulse 2s infinite; pointer-events: none; }
.yl { position: absolute; right: 100%; margin-right: .6em; transform: translateY(-50%); font-size: var(--sm); color: var(--c-muted); white-space: nowrap; }
.nowl { position: absolute; right: 0; transform: translate(0, -160%); font-size: var(--sub); font-weight: 600; color: var(--c-navy); background: rgba(255, 255, 255, .85); padding: 0 .3em; }
.ax { position: relative; height: 1.6em; margin: .5em 0 0 calc(4.2 * var(--sm)); font-size: var(--sm); color: var(--c-muted); } .ax span { position: absolute; transform: translateX(-50%); white-space: nowrap; } .ax span:last-child { transform: translateX(-100%); } .ax span:first-child { transform: none; }
.bz { display: grid; grid-template-columns: minmax(0, 8em) minmax(0, 1fr) 4.5em; gap: 12px; align-items: center; font-size: var(--sub); padding: 9px 0; border-top: 1px solid var(--c-rule); } .bz span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .bz b { text-align: right; }
.bb { height: .7em; background: var(--c-paper-2); } .bb i { display: block; height: 100%; background: var(--c-blue-deep); transition: width .8s; }
.wk { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .wk div { background: var(--c-paper-3); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; } .wk span { font-size: var(--sm); color: var(--c-muted); } .wk b { font-size: calc(var(--big) * .6); font-weight: 600; } .wk em { font-style: normal; font-size: var(--sm); color: var(--c-muted); }
.mut { color: var(--c-muted); font-size: var(--sub); } .sm { font-size: var(--sm); margin: 10px 0 0; }
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
