<script setup lang="ts">
// Three charts side by side: gold, silver and an interest rate, each over the last 24 months by default.
const props = defineProps<{ editable?: boolean; country?: 'US' | 'NG' | null }>()
interface M { price: number; as_of: string; day_change_pct: number | null; series: { d: string; price: number }[] }
interface R { country: string; product: string; source: string | null; points: { as_of: string; rate: number }[]; latest: { as_of: string; rate: number } | null }
const { data, refresh } = await useFetch<{ metals: { gold: M | null; silver: M | null }; rates: R[] }>(() => '/api/wm/market' + (props.country ? '?country=' + props.country : ''), { key: 'wm-market-' + (props.country ?? 'all') })
const RANGES: [string, number][] = [['6M', 183], ['1Y', 366], ['2Y', 731], ['5Y', 1830]]
const range = ref('2Y')
const since = computed(() => new Date(Date.now() - RANGES.find((r) => r[0] === range.value)![1] * 86400e3).toISOString().slice(0, 10))
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v)
const pct = (v: number | null) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%')
function view(m: M | null) {
  if (!m) return null
  const pts = m.series.filter((s) => s.d >= since.value)
  const first = pts.length > 1 ? pts[0]!.price : null
  return { pts: pts.map((s) => ({ x: s.d, y: s.price })), growth: first ? ((m.price - first) / first) * 100 : null, from: pts[0]?.d ?? null }
}
const metals = computed(() => ([['gold', 'Gold', '#b8860b'], ['silver', 'Silver', '#6b7280']] as const).map(([k, l, c]) => ({ k, l, c, m: data.value?.metals[k] ?? null, v: view(data.value?.metals[k] ?? null) })))
const rateKey = ref('')
const rates = computed(() => data.value?.rates ?? [])
watchEffect(() => { if (!rateKey.value && rates.value.length) { const pref = rates.value.find((r) => r.country === (props.country ?? 'US')) ?? rates.value[0]!; rateKey.value = pref.country + '|' + pref.product } })
const rate = computed(() => rates.value.find((r) => r.country + '|' + r.product === rateKey.value) ?? null)
const ratePts = computed(() => (rate.value?.points ?? []).filter((p) => p.as_of >= since.value))
const rateDelta = computed(() => (ratePts.value.length > 1 ? ratePts.value[ratePts.value.length - 1]!.rate - ratePts.value[0]!.rate : null))
const nf = reactive({ open: false, country: 'NG', product: 'Nigerian T-bills (364-day)', rate: '' as string | number, as_of: new Date().toISOString().slice(0, 10), source: '' }); const msg = ref('')
async function addRate() { msg.value = ''; try { await $fetch('/api/wm/rates', { method: 'POST', body: { country: nf.country, product: nf.product, rate: Number(nf.rate), as_of: nf.as_of, source: nf.source } }); nf.open = false; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
</script>
<template>
  <div v-if="data" class="mw">
    <div class="mh"><h3>Markets</h3><div class="rh"><button v-if="editable" class="lk" @click="nf.open = !nf.open">{{ nf.open ? 'Close' : '+ Record a rate' }}</button><div class="rgs"><button v-for="[r] in RANGES" :key="r" :class="{ on: range === r }" @click="range = r">{{ r }}</button></div></div></div>
    <div v-if="nf.open" class="nf card"><select v-model="nf.country"><option value="NG">Nigeria</option><option value="US">United States</option></select><input v-model="nf.product" placeholder="Product, e.g. Nigerian T-bills (364-day), 12-month bank CD"><input v-model="nf.rate" type="number" step="0.01" placeholder="Rate %"><input v-model="nf.as_of" type="date"><input v-model="nf.source" placeholder="Source (CBN, bank…)"><button class="btn sm" :disabled="!nf.product || nf.rate === ''" @click="addRate">Save</button><span v-if="msg" class="error">{{ msg }}</span></div>
    <div class="g3">
      <div v-for="x in metals" :key="x.k" class="card col"><div class="top"><span class="nm">{{ x.l }} <em>USD/oz</em></span><span class="pr">{{ x.m ? usd(x.m.price) : '—' }}</span></div>
        <div class="chg"><span v-if="x.m?.day_change_pct != null" :class="x.m.day_change_pct >= 0 ? 'up' : 'dn'">{{ pct(x.m.day_change_pct) }} today</span><span v-else class="mut">live</span><span v-if="x.v?.growth != null" :class="x.v.growth >= 0 ? 'up' : 'dn'"><b>{{ pct(x.v.growth) }}</b> over {{ range }}</span></div>
        <AreaTrend v-if="x.v && x.v.pts.length > 1" :points="x.v.pts" :color="x.c" :height="150" :format="usd" /><p v-else class="mut ld">Loading price history…</p></div>
      <div class="card col"><div class="top"><select v-if="rates.length > 1" v-model="rateKey" class="rsel"><option v-for="r in rates" :key="r.country + r.product" :value="r.country + '|' + r.product">{{ r.product }} ({{ r.country }})</option></select><span v-else class="nm">{{ rate?.product ?? 'Interest rates' }}</span><span class="pr">{{ rate?.latest ? rate.latest.rate.toFixed(2) + '%' : '—' }}</span></div>
        <div class="chg"><span class="mut">{{ rate?.source ?? '' }}{{ rate?.latest ? ' · ' + rate.latest.as_of : '' }}</span><span v-if="rateDelta != null" :class="rateDelta >= 0 ? 'up' : 'dn'"><b>{{ rateDelta >= 0 ? '+' : '' }}{{ (rateDelta * 100).toFixed(0) }} bps</b> over {{ range }}</span></div>
        <AreaTrend v-if="ratePts.length > 1" :points="ratePts.map((p) => ({ x: p.as_of, y: p.rate }))" :height="150" :format="(v: number) => v.toFixed(2) + '%'" /><p v-else class="mut ld">{{ rates.length ? 'Record more readings to see the trend.' : 'US T-bill rates load from the US Treasury; record Nigerian T-bills and bank CDs with + Record a rate.' }}</p></div>
    </div>
  </div>
</template>
<style scoped>
.mw { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; } .mh { display: flex; justify-content: space-between; align-items: center; } .mh h3 { margin: 0; font-size: 15px; } .rh { display: flex; gap: 14px; align-items: center; } .mut { color: var(--c-muted); font-size: 12.5px; } .ld { padding: 50px 0; text-align: center; }
.rgs { display: flex; border: 1px solid var(--c-rule); } .rgs button { background: #fff; border: 0; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; color: var(--c-ink-soft); } .rgs button.on { background: var(--c-navy); color: #fff; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; } .nm { font-weight: 600; } .nm em { font-style: normal; font-weight: 400; color: var(--c-muted); font-size: 12px; } .pr { font-size: 22px; font-weight: 600; white-space: nowrap; }
.rsel { font: inherit; font-size: 13px; font-weight: 600; border: 0; background: none; padding: 0; max-width: 70%; cursor: pointer; } .chg { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; margin-bottom: 6px; } .up { color: var(--c-ok); } .dn { color: var(--c-danger); }
.nf { display: flex; gap: 6px; flex-wrap: wrap; } .nf input, .nf select { font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); } .nf input:nth-child(2) { flex: 1; min-width: 220px; } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; } .error { color: var(--c-danger); font-size: 12.5px; }
@media (max-width: 1000px) { .g3 { grid-template-columns: 1fr; } }
</style>
