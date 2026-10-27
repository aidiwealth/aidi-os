<script setup lang="ts">
// Growth calculator: starting amount, monthly contribution, expected yearly return, fees and years (illustration only).
// Sliders with the value beside them, quick scenarios, a stacked chart of money put in against growth, the same plan
// with 1% yearly fees as a dashed line, and the year each milestone is reached. start: the client's holdings, offered
// as the starting amount.
const props = defineProps<{ start?: number | null }>()
const p = reactive({ start: 100000, monthly: 2000, rate: 8, years: 15, fee: 0 })
const SCEN: [string, number][] = [['Cautious', 5], ['Base', 8], ['Strong', 10]]
function sim(rate: number, fee: number) { const out: { year: number; value: number; paid: number }[] = [{ year: 0, value: p.start, paid: p.start }]; let v = Number(p.start) || 0, paid = v; const r = (rate - fee) / 100 / 12
  for (let y = 1; y <= Math.min(50, Number(p.years) || 0); y++) { for (let m = 0; m < 12; m++) { v = v * (1 + r) + (Number(p.monthly) || 0); paid += Number(p.monthly) || 0 } out.push({ year: y, value: v, paid }) } return out }
const rows = computed(() => sim(Number(p.rate), Number(p.fee)))
const withFee = computed(() => sim(Number(p.rate), Number(p.fee) + 1))
const last = computed(() => rows.value[rows.value.length - 1]!)
const lastFee = computed(() => withFee.value[withFee.value.length - 1]!)
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(v))
const W = 1000, H = 260, P = 10
const top = computed(() => Math.max(1, ...rows.value.map((r) => r.value)) * 1.05)
const X = (i: number) => (i / Math.max(1, rows.value.length - 1)) * W
const Y = (v: number) => H - P - (v / top.value) * (H - 2 * P)
const line = (k: 'value' | 'paid', src = rows.value) => src.map((r, i) => X(i).toFixed(1) + ',' + Y(r[k]).toFixed(1)).join(' ')
const area = (k: 'value' | 'paid') => '0,' + (H - P) + ' ' + line(k) + ' ' + W + ',' + (H - P)
// The milestones: round amounts above the start, and the (fractional) year each is first reached.
const milestones = computed(() => {
  const end = last.value.value, base = [100000, 250000, 500000, 1e6, 2.5e6, 5e6, 1e7, 2.5e7, 5e7, 1e8].filter((m) => m > p.start && m <= end).slice(-3)
  return base.map((m) => { const i = rows.value.findIndex((r) => r.value >= m); const a = rows.value[i - 1]!, b = rows.value[i]!; return { m, year: i - 1 + (m - a.value) / (b.value - a.value || 1) } })
})
const short = (v: number) => (v >= 1e6 ? '$' + (v / 1e6).toString().replace(/\.0+$/, '') + 'M' : '$' + Math.round(v / 1000) + 'k')
const ticks = computed(() => { const n = Number(p.years) || 0, step = n <= 10 ? 2 : n <= 20 ? 5 : 10; const out: number[] = []; for (let y = 0; y <= n; y += step) out.push(y); return out })
</script>
<template>
  <div class="card wc">
    <div class="hd"><h3>Wealth calculator</h3><button v-if="start" class="btn secondary sm" @click="p.start = Math.round(start)">Start from this client's holdings ({{ usd(start) }})</button></div>
    <div class="ly">
      <div class="ctl">
        <label><span>Starting amount<b>{{ usd(p.start) }}</b></span><input v-model.number="p.start" type="range" min="0" :max="Math.max(1000000, p.start)" step="5000"></label>
        <label><span>Added each month<b>{{ usd(p.monthly) }}</b></span><input v-model.number="p.monthly" type="range" min="0" max="20000" step="100"></label>
        <label><span>Yearly return<b>{{ p.rate }}%</b></span><input v-model.number="p.rate" type="range" min="0" max="15" step="0.5"></label>
        <label><span>Yearly fees<b>{{ p.fee }}%</b></span><input v-model.number="p.fee" type="range" min="0" max="3" step="0.1"></label>
        <label><span>Years<b>{{ p.years }}</b></span><input v-model.number="p.years" type="range" min="1" max="40" step="1"></label>
        <div class="sc"><button v-for="[l, r] in SCEN" :key="l" :class="{ on: p.rate === r }" @click="p.rate = r">{{ l }} {{ r }}%</button></div>
      </div>
      <div class="out">
        <div class="res"><div><span>Projected value</span><b>{{ usd(last.value) }}</b><em>after {{ p.years }} year{{ p.years === 1 ? '' : 's' }}</em></div><div><span>You put in</span><b>{{ usd(last.paid) }}</b><em>{{ usd(p.start) }} plus {{ usd(p.monthly) }} a month</em></div><div><span>Growth</span><b>{{ usd(last.value - last.paid) }}</b><em>{{ last.value > 0 ? Math.round(((last.value - last.paid) / last.value) * 100) : 0 }}% of the final value</em></div></div>
        <div class="lg"><span><i class="a" />Money put in</span><span><i class="b" />Growth</span><span><i class="c" />With 1% more in yearly fees: {{ usd(lastFee.value) }}</span></div>
        <svg :viewBox="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" class="sv" role="img" :aria-label="'Projected value over ' + p.years + ' years'">
          <polygon :points="area('value')" fill="#b9cfe2" /><polygon :points="area('paid')" fill="#1c547d" />
          <polyline :points="line('value', withFee)" fill="none" stroke="#0c1a2e" stroke-width="2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke" />
          <line v-for="m in milestones" :key="m.m" :x1="(m.year / Math.max(1, p.years)) * W" :x2="(m.year / Math.max(1, p.years)) * W" :y1="P" :y2="H - P" stroke="#6e737b" stroke-width="1" stroke-dasharray="2 4" vector-effect="non-scaling-stroke" />
        </svg>
        <div class="ax"><span v-for="y in ticks" :key="y" :style="{ left: (y / Math.max(1, p.years)) * 100 + '%' }">{{ y === 0 ? 'Today' : 'Year ' + y }}</span></div>
        <div v-if="milestones.length" class="ms"><div v-for="m in milestones" :key="m.m"><span>Reaches {{ short(m.m) }}</span><b>Year {{ m.year.toFixed(1) }}</b></div></div>
      </div>
    </div>
    <p class="mut">An illustration only, with a steady return and no taxes. Real returns go up and down; this is not a forecast or advice.</p>
  </div>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; } .hd h3 { margin: 0; font-size: 15px; }
.ly { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 24px; }
.ctl { display: flex; flex-direction: column; gap: 14px; } .ctl label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--c-muted); } .ctl label span { display: flex; justify-content: space-between; } .ctl label b { color: var(--c-ink); font-weight: 600; font-size: 14px; }
input[type=range] { width: 100%; accent-color: #1c547d; margin: 0; }
.sc { display: flex; gap: 6px; flex-wrap: wrap; } .sc button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 5px 10px; font: inherit; font-size: 12.5px; cursor: pointer; } .sc button.on { border-color: var(--c-navy); background: var(--c-navy); color: #fff; }
.res { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; } .res span { display: block; font-size: 12.5px; color: var(--c-muted); } .res b { display: block; font-size: 22px; font-weight: 600; } .res div:first-child b { color: var(--c-blue-deep); } .res em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.lg { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12.5px; color: var(--c-ink-soft); margin: 14px 0 6px; } .lg i { display: inline-block; width: 12px; height: 10px; margin-right: 6px; vertical-align: -1px; } .lg .a { background: #1c547d; } .lg .b { background: #b9cfe2; } .lg .c { height: 0; border-top: 2px dashed #0c1a2e; }
.sv { width: 100%; height: 240px; display: block; } .ax { position: relative; height: 18px; font-size: 11.5px; color: var(--c-muted); } .ax span { position: absolute; transform: translateX(-50%); white-space: nowrap; } .ax span:first-child { transform: none; } .ax span:last-child:not(:first-child) { transform: translateX(-100%); }
.ms { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; } .ms div { border: 1px solid var(--c-rule); padding: 8px 12px; min-width: 120px; } .ms span { display: block; font-size: 12px; color: var(--c-muted); } .ms b { font-size: 15px; }
.mut { color: var(--c-muted); font-size: 12px; margin: 14px 0 0; }
@media (max-width: 900px) { .ly { grid-template-columns: 1fr; } .res { grid-template-columns: 1fr; } }
</style>
