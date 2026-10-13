<script setup lang="ts">
// Rentals overview: combined and per-property numbers for the month vs last month, income vs expenses over 12 months,
// "Needs attention", recent activity; tap a property for each room/unit. Admins export the P&L.
interface Fig { income: number; expenses: number; profit: number; occupancy: number | null; nights: number; adr: number | null; books?: boolean }
interface Rt { rating: number; reviews: number } 
interface U { id: string; name: string; title: string | null; rental_model: string; source: string; listing: string | null; image_url: string | null; now: Fig; before: Fig; rating: Rt | null; nights_source: string }
interface P { id: string; name: string; address: string | null; kind: string; image_url: string | null; now: Fig; before: Fig; rating: Rt | null; units: U[] }
interface D { itemised: boolean; period: string; label: string; properties: P[]; total: { now: Fig; before: Fig; rating: Rt | null }; chart: { period: string; income: number; expenses: number; books: boolean }[]; attention: { kind: string; text: string; to: string }[]; activity: { event: string; detail: string | null; created_at: string }[]; periods: string[]; admin: boolean; locked: boolean }
const route = useRoute()
const period = ref(String(route.query.period ?? ''))
const { data } = await useFetch<D>('/api/rentals/overview', { query: { period } })
watch(data, (d) => { if (d && !period.value) period.value = d.period }, { immediate: true })
const open = ref<string>('')
const usd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'))
const usd2 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const pct = (a: number | null, b: number | null) => { if (a === null || b === null || !b) return ''; const v = Math.round((a - b) / Math.abs(b) * 100); return Math.abs(v) > 500 ? '' : (v >= 0 ? '+' : '') + v + '% vs last month' }
const pts = (a: number | null, b: number | null) => (a === null || b === null ? '' : (a >= b ? '+' : '') + (a - b).toFixed(1) + ' pts vs last month')
const tone = (a: number | null, b: number | null, invert = false) => (a === null || b === null || a === b ? '' : (a > b) !== invert ? 'up' : 'dn')
const mon = (p: string) => new Date(p + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
const months = computed(() => [...new Set([...(data.value?.periods ?? []), data.value?.period ?? ''])].filter(Boolean).sort().reverse())
const max = computed(() => Math.max(1, ...(data.value?.chart ?? []).flatMap((c) => [c.income, c.expenses])))
// Export
const ex = reactive({ open: false, scope: 'month' as 'month' | 'year', month: '', year: '', property: '', format: 'pdf' })
function openExport() { Object.assign(ex, { open: true, month: data.value?.period ?? '', year: (data.value?.period ?? '').slice(0, 4) }) }
const exportUrl = computed(() => '/api/rentals/export?' + new URLSearchParams({ period: ex.scope === 'year' ? ex.year : ex.month, format: ex.format, ...(ex.property ? { property: ex.property } : {}) }).toString())
const ago = (d: string) => { const s = (Date.now() - new Date(d).getTime()) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd' }
</script>
<template>
  <div v-if="data" class="ov">
    <div class="bar"><label class="sel">Month<select v-model="period"><option v-for="m in months" :key="m" :value="m">{{ new Date(m + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }}</option></select></label><span v-if="data.locked" class="lk">Locked</span><span class="sp" /><button v-if="data.admin" type="button" class="btn secondary" @click="openExport">Export P&amp;L</button></div>

    <div v-if="data.attention.length || data.activity.length" class="two">
      <div class="card att"><h2>Needs attention <span v-if="data.attention.length" class="n">{{ data.attention.length }}</span></h2>
        <NuxtLink v-for="(a, i) in data.attention.slice(0, 8)" :key="i" :to="a.to" class="ai"><span class="dot" :data-k="a.kind" /><span>{{ a.text }}</span></NuxtLink>
        <p v-if="!data.attention.length" class="ok">✓ Nothing needs attention.</p></div>
      <div class="card act"><h2>Activity</h2>
        <div v-for="(a, i) in data.activity.slice(0, 7)" :key="i" class="av"><b>{{ a.event }}</b><span>{{ a.detail }}</span><em>{{ ago(a.created_at) }}</em></div>
        <p v-if="!data.activity.length" class="mut">New bookings, reviews and imports appear here.</p></div>
    </div>

    <h2 class="h2">{{ data.label }} · all properties</h2>
    <p v-if="data.total.now.books" class="bk">Part of this month comes from the bank (Airbnb deposits, itemised costs) or the monthly books. Per-room income, occupancy and nightly rate start from the months you import Airbnb files for.</p>
    <div class="fx-stats six">
      <StatTile icon="money" tone="g" label="Income" :value="usd(data.total.now.income)" :note="pct(data.total.now.income, data.total.before.income)" :note-tone="tone(data.total.now.income, data.total.before.income) as any" />
      <StatTile icon="billing" tone="a" label="Expenses" :value="usd(data.total.now.expenses)" :note="pct(data.total.now.expenses, data.total.before.expenses)" :note-tone="tone(data.total.now.expenses, data.total.before.expenses, true) as any" />
      <StatTile icon="chart" tone="b" label="Profit" :value="usd(data.total.now.profit)" :red="data.total.now.profit < 0" :note="pct(data.total.now.profit, data.total.before.profit)" :note-tone="tone(data.total.now.profit, data.total.before.profit) as any" />
      <StatTile icon="calendar" tone="c" label="Occupancy" :value="data.total.now.occupancy === null ? '—' : data.total.now.occupancy + '%'" full :note="pts(data.total.now.occupancy, data.total.before.occupancy)" :note-tone="tone(data.total.now.occupancy, data.total.before.occupancy) as any" />
      <StatTile icon="building" tone="n" label="Avg nightly rate" :value="usd(data.total.now.adr)" :note="pct(data.total.now.adr, data.total.before.adr)" :note-tone="tone(data.total.now.adr, data.total.before.adr) as any" />
      <StatTile icon="check" tone="g" label="Rating" :value="data.total.rating ? '★ ' + data.total.rating.rating.toFixed(2) : '—'" full :note="data.total.rating ? data.total.rating.reviews + ' reviews' : 'from Airbnb'" />
    </div>

    <div class="card ch"><div class="chh"><h2>Income vs expenses</h2><span class="lg"><i class="inc" /> Income <i class="exp" /> Expenses<template v-if="data.chart.some((c) => c.books)"> · faded months use the bank or books</template></span></div>
      <div class="bars"><div v-for="c in data.chart" :key="c.period" class="col" :class="{ cur: c.period === data.period, bks: c.books }" :title="mon(c.period) + ': income ' + usd(c.income) + ', expenses ' + usd(c.expenses) + (c.books ? ' (monthly books)' : '')">
        <div class="pair"><span class="b inc" :style="{ height: (c.income / max * 100) + '%' }" /><span class="b exp" :style="{ height: (c.expenses / max * 100) + '%' }" /></div><em>{{ mon(c.period) }}</em></div></div></div>

    <div class="props">
      <div v-for="p in data.properties" :key="p.id" class="card pc">
        <button type="button" class="pch" :aria-expanded="open === p.id" @click="open = open === p.id ? '' : p.id">
          <span v-if="p.image_url" class="pimg" :style="{ backgroundImage: 'url(' + p.image_url + ')' }" />
          <div><b>{{ p.name }}</b><span>{{ p.units.length }} {{ p.units.length === 1 ? 'unit' : (p.units[0]?.rental_model === 'room' ? 'rooms' : 'units') }}{{ p.address ? ' · ' + p.address : '' }}</span></div>
          <span v-if="p.rating" class="rt">★ {{ p.rating.rating.toFixed(2) }} <em>({{ p.rating.reviews }})</em></span><span class="chev">›</span></button>
        <div class="pm">
          <div><em>Income</em><b>{{ data.itemised ? usd(p.now.income) : '—' }}</b><i :class="tone(p.now.income, p.before.income)">{{ data.itemised ? pct(p.now.income, p.before.income) || '—' : 'needs that month\'s Airbnb CSV' }}</i></div>
          <div><em>Expenses</em><b>{{ usd(p.now.expenses) }}</b><i :class="tone(p.now.expenses, p.before.expenses, true)">{{ pct(p.now.expenses, p.before.expenses) || '—' }}</i></div>
          <div><em>Profit</em><b :class="{ neg: data.itemised && p.now.profit < 0 }">{{ data.itemised ? usd(p.now.profit) : '—' }}</b><i :class="tone(p.now.profit, p.before.profit)">{{ data.itemised ? pct(p.now.profit, p.before.profit) || '—' : 'shared costs ' + usd(p.now.expenses) }}</i></div>
          <div><em>Occupancy</em><b>{{ p.now.occupancy === null || !data.itemised ? '—' : p.now.occupancy + '%' }}</b><i :class="tone(p.now.occupancy, p.before.occupancy)">{{ pts(p.now.occupancy, p.before.occupancy) || '—' }}</i></div>
          <div><em>Avg nightly rate</em><b>{{ usd(p.now.adr) }}</b><i>{{ p.now.nights }} nights</i></div>
        </div>
        <table v-if="open === p.id" class="ut" data-nosearch><thead><tr><th>{{ p.units[0]?.rental_model === 'room' ? 'Room' : 'Unit' }}</th><th class="r">Income</th><th class="r">Expenses</th><th class="r">Profit</th><th class="r">Occupancy</th><th class="r">Nightly rate</th><th class="r">Rating</th></tr></thead>
          <tbody><tr v-for="u in p.units" :key="u.id"><td class="un"><span v-if="u.image_url" class="uimg" :style="{ backgroundImage: 'url(' + u.image_url + ')' }" /><span><b>{{ u.name }}</b><span class="sub">{{ u.title ?? (u.source === 'airbnb' ? 'Airbnb' : 'Direct rental') }}</span></span></td><td class="r">{{ data.itemised ? usd2(u.now.income) : '—' }}</td><td class="r">{{ usd2(u.now.expenses) }}<span class="sub">incl. share of shared costs</span></td><td class="r" :class="{ neg: data.itemised && u.now.profit < 0 }">{{ data.itemised ? usd2(u.now.profit) : '—' }}</td>
            <td class="r">{{ u.now.occupancy === null || !data.itemised ? '—' : u.now.occupancy + '%' }}<span class="sub">{{ u.now.nights }} nights{{ u.nights_source === 'report' ? ' · Airbnb report' : '' }}</span></td><td class="r">{{ usd2(u.now.adr) }}</td><td class="r">{{ u.rating ? '★ ' + u.rating.rating.toFixed(2) : '—' }}<span v-if="u.rating" class="sub">{{ u.rating.reviews }} reviews</span></td></tr></tbody></table>
      </div>
      <EmptyState v-if="!data.properties.length" card icon="entities" title="No properties yet" text="An admin adds each property once under Properties." />
    </div>

    <AppModal :open="ex.open" title="Export P&L" @close="ex.open = false">
      <div class="ef">
        <div class="seg"><button type="button" :class="{ on: ex.scope === 'month' }" @click="ex.scope = 'month'">Month</button><button type="button" :class="{ on: ex.scope === 'year' }" @click="ex.scope = 'year'">Year</button></div>
        <label v-if="ex.scope === 'month'" class="label">Month<input v-model="ex.month" type="month"></label><label v-else class="label">Year<input v-model="ex.year" inputmode="numeric" maxlength="4"></label>
        <label class="label">Property<select v-model="ex.property"><option value="">All properties (one page each)</option><option v-for="p in data.properties" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <label class="label">Format<select v-model="ex.format"><option value="pdf">PDF</option><option value="csv">CSV</option></select></label>
        <p class="mut">Income, Airbnb fees, remitted taxes, expenses by category and profit, ready for the accountant.</p></div>
      <template #foot><button class="btn secondary" @click="ex.open = false">Cancel</button><a class="btn" :href="exportUrl" @click="ex.open = false">Download</a></template>
    </AppModal>
  </div>
</template>
<style scoped>
.ov { display: flex; flex-direction: column; gap: 16px; } .bar { display: flex; gap: 12px; align-items: center; } .sel { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--c-muted); } .sel select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.sp { flex: 1; } .lk { font-size: 11.5px; font-weight: 600; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-muted); }
.two { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; } h2 { margin: 0 0 10px; font-size: 16px; } .h2 { margin: 4px 0 -4px; font-size: 16px; } .n { font-size: 12px; font-weight: 600; background: #fdecef; color: var(--c-danger); padding: 1px 7px; margin-left: 6px; }
.ai { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-top: 1px solid var(--c-rule); text-decoration: none; color: var(--c-ink); font-size: 13.5px; } .ai:hover { color: var(--c-blue-deep); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c-warn); flex: none; margin-top: 6px; } .dot[data-k="rent"], .dot[data-k="payout"] { background: var(--c-danger); } .dot[data-k="listing"] { background: var(--c-blue-deep); }
.ok { color: var(--c-ok); font-size: 13.5px; margin: 0; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; }
.av { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; padding: 7px 0; border-top: 1px solid var(--c-rule); font-size: 13px; } .av b { font-weight: 600; } .av span { grid-column: 1; color: var(--c-ink-soft); } .av em { grid-row: 1; grid-column: 2; font-style: normal; color: var(--c-muted); font-size: 12px; }
.six { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
.chh { display: flex; justify-content: space-between; align-items: baseline; } .lg { font-size: 12.5px; color: var(--c-muted); display: flex; gap: 6px; align-items: center; } .lg i { width: 10px; height: 10px; display: inline-block; } .lg i.exp { margin-left: 10px; }
.bk { margin: -4px 0 0; font-size: 12.5px; color: var(--c-muted); } .bks .b { opacity: .45; }
.inc { background: var(--c-navy); } .exp { background: #9cc7e6; }
.bars { display: grid; grid-template-columns: repeat(12, 1fr); gap: 8px; height: 170px; align-items: end; } .col { display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; } .pair { flex: 1; width: 100%; display: flex; gap: 3px; align-items: flex-end; justify-content: center; }
.b { width: 42%; max-width: 16px; min-height: 1px; } .col em { font-style: normal; font-size: 11.5px; color: var(--c-muted); } .col.cur em { color: var(--c-navy); font-weight: 600; }
.props { display: flex; flex-direction: column; gap: 14px; } .pc { padding: 0; } .pch { display: flex; gap: 12px; align-items: center; width: 100%; background: none; border: 0; padding: 16px 18px; font: inherit; text-align: left; cursor: pointer; color: inherit; } .pch > div { flex: 1; display: flex; flex-direction: column; gap: 2px; } .pch b { font-size: 16px; } .pch span { font-size: 12.5px; color: var(--c-muted); }
.pimg { width: 64px; height: 48px; flex: none; background: var(--c-paper-2) center / cover no-repeat; } .un { display: flex; gap: 10px; align-items: center; } .uimg { width: 44px; height: 34px; flex: none; background: var(--c-paper-2) center / cover no-repeat; }
.rt { font-size: 13.5px !important; color: var(--c-ink) !important; font-weight: 500; } .rt em { font-style: normal; color: var(--c-muted); } .chev { color: var(--c-muted); font-size: 20px !important; transition: transform .15s; } .pch[aria-expanded="true"] .chev { transform: rotate(90deg); }
.pm { display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid var(--c-rule); } .pm > div { display: flex; flex-direction: column; gap: 2px; padding: 12px 18px; border-left: 1px solid var(--c-rule); } .pm > div:first-child { border-left: 0; }
.pm em { font-style: normal; font-size: 12px; color: var(--c-muted); } .pm b { font-size: 19px; font-weight: 500; color: var(--c-navy); } .pm i { font-style: normal; font-size: 11.5px; color: var(--c-muted); } .pm i.up { color: var(--c-ok); } .pm i.dn { color: var(--c-danger); } .neg { color: var(--c-danger) !important; }
.ut { width: 100%; border-collapse: collapse; border-top: 1px solid var(--c-rule); } .ut th { text-align: left; font-weight: 400; font-size: 12px; color: var(--c-muted); padding: 9px 18px; background: #fbfaf7; border-bottom: 1px solid var(--c-rule); } .ut td { padding: 10px 18px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } .ut .r { text-align: right; } .sub { display: block; font-size: 11.5px; color: var(--c-muted); }
.ef { display: flex; flex-direction: column; gap: 12px; } .label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .ef input, .ef select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.seg { display: flex; } .seg button { flex: 1; background: #fff; border: 1px solid var(--c-rule-strong); padding: 7px; font: inherit; cursor: pointer; } .seg button + button { border-left: 0; } .seg .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
@media (max-width: 1100px) { .pm { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 760px) { .two { grid-template-columns: 1fr; } .six { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } .pm { grid-template-columns: 1fr 1fr; } .ut { display: block; overflow-x: auto; } }
</style>
