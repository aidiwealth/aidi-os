<script setup lang="ts">
// Gold and silver: live price, day change and growth over 1M / 6M / 1Y / 5Y. Interest rates: one card per product
// with the latest rate, change since the previous reading, and its history.
const props = defineProps<{ editable?: boolean; country?: 'US' | 'NG' | null }>()
interface M { price: number; as_of: string; day_change_pct: number | null; series: { d: string; price: number }[] }
interface R { country: string; product: string; source: string | null; points: { as_of: string; rate: number }[]; latest: { as_of: string; rate: number } | null }
const { data, refresh } = await useFetch<{ metals: { gold: M | null; silver: M | null }; rates: R[] }>(() => '/api/wm/market' + (props.country ? '?country=' + props.country : ''), { key: 'wm-market-' + (props.country ?? 'all') })
const RANGES: [string, number][] = [['1M', 31], ['6M', 183], ['1Y', 366], ['5Y', 1830]]
const range = ref('1Y')
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v)
const pct = (v: number | null) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%')
function view(m: M | null) {
  if (!m) return null
  const days = RANGES.find((r) => r[0] === range.value)![1], since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10)
  const pts = m.series.filter((s) => s.d >= since)
  const first = pts[0]?.price ?? null
  return { pts: pts.map((s) => ({ x: s.d, y: s.price })), growth: first ? ((m.price - first) / first) * 100 : null, first, since: pts[0]?.d ?? null }
}
const metals = computed(() => [['gold', 'Gold', '#b8860b'], ['silver', 'Silver', '#6b7280']].map(([k, l, c]) => ({ k, l, c, m: data.value?.metals[k as 'gold'] ?? null, v: view(data.value?.metals[k as 'gold'] ?? null) })))
const byCountry = computed(() => (['US', 'NG'] as const).map((c) => ({ c, label: c === 'US' ? 'United States' : 'Nigeria', rates: (data.value?.rates ?? []).filter((r) => r.country === c) })).filter((g) => g.rates.length))
const delta = (r: R) => (r.points.length > 1 ? r.points[r.points.length - 1]!.rate - r.points[r.points.length - 2]!.rate : null)
const nf = reactive({ open: false, country: 'NG', product: 'Nigerian T-bills (364-day)', rate: '' as string | number, as_of: new Date().toISOString().slice(0, 10), source: '' }); const msg = ref('')
async function addRate() { msg.value = ''; try { await $fetch('/api/wm/rates', { method: 'POST', body: { country: nf.country, product: nf.product, rate: Number(nf.rate), as_of: nf.as_of, source: nf.source } }); nf.open = false; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
</script>
<template>
  <div v-if="data" class="mw">
    <div class="card mbox"><div class="mh"><h3>Gold &amp; silver</h3><div class="rgs"><button v-for="[r] in RANGES" :key="r" :class="{ on: range === r }" @click="range = r">{{ r }}</button></div></div>
      <div class="mt"><div v-for="x in metals" :key="x.k" class="mc"><template v-if="x.m && x.v"><div class="top"><span class="nm">{{ x.l }} <em>USD/oz</em></span><span class="pr">{{ usd(x.m.price) }}</span></div>
          <div class="chg"><span :class="(x.m.day_change_pct ?? 0) >= 0 ? 'up' : 'dn'">{{ pct(x.m.day_change_pct) }} today</span><span :class="(x.v.growth ?? 0) >= 0 ? 'up' : 'dn'"><b>{{ pct(x.v.growth) }}</b> over {{ range }}</span></div>
          <AreaTrend v-if="x.v.pts.length > 1" :points="x.v.pts" :color="x.c" :height="140" :format="usd" /><p v-else class="mut">History is loading; check back shortly.</p></template>
        <p v-else class="mut">{{ x.l }}: live price unavailable right now.</p></div></div></div>
    <div class="card rbox"><div class="mh"><h3>Interest rates</h3><button v-if="editable" class="btn secondary sm" @click="nf.open = !nf.open">{{ nf.open ? 'Close' : 'Record a rate' }}</button></div>
      <div v-if="nf.open" class="nf"><select v-model="nf.country"><option value="NG">Nigeria</option><option value="US">United States</option></select><input v-model="nf.product" placeholder="Product, e.g. Nigerian T-bills (364-day), 12-month bank CD"><input v-model="nf.rate" type="number" step="0.01" placeholder="Rate %"><input v-model="nf.as_of" type="date"><input v-model="nf.source" placeholder="Source (CBN, bank…)"><button class="btn sm" :disabled="!nf.product || nf.rate === ''" @click="addRate">Save</button><span v-if="msg" class="error">{{ msg }}</span></div>
      <div v-for="g in byCountry" :key="g.c" class="grp"><p class="gl">{{ g.label }}</p>
        <div class="rg"><div v-for="r in g.rates" :key="r.product" class="rc"><div class="rt"><span class="rn">{{ r.product }}</span><span class="rs">{{ r.source }}</span></div>
            <div class="rv"><b>{{ r.latest ? r.latest.rate.toFixed(2) + '%' : '—' }}</b><span v-if="delta(r) != null" :class="delta(r)! >= 0 ? 'up' : 'dn'">{{ delta(r)! >= 0 ? '▲' : '▼' }} {{ Math.abs(delta(r)! * 100).toFixed(0) }} bps</span><em>as of {{ r.latest?.as_of }}</em></div>
            <AreaTrend v-if="r.points.length > 1" :points="r.points.map((p) => ({ x: p.as_of, y: p.rate }))" :height="90" :format="(v: number) => v.toFixed(2) + '%'" /><p v-else class="mut">Record more readings to see the trend.</p></div></div></div>
      <p v-if="!data.rates.length" class="mut">No rates yet. US T-bill rates load from the US Treasury; record Nigerian T-bills, bank CDs and savings rates here.</p></div>
  </div>
</template>
<style scoped>
.mw { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; } .mh { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; } .mh h3 { margin: 0; font-size: 15px; } .mut { color: var(--c-muted); font-size: 12.5px; }
.rgs { display: flex; border: 1px solid var(--c-rule); } .rgs button { background: #fff; border: 0; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; color: var(--c-ink-soft); } .rgs button.on { background: var(--c-navy); color: #fff; }
.mt { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; } .top { display: flex; justify-content: space-between; align-items: baseline; } .nm { font-weight: 600; } .nm em { font-style: normal; font-weight: 400; color: var(--c-muted); font-size: 12px; } .pr { font-size: 24px; font-weight: 600; }
.chg { display: flex; justify-content: space-between; font-size: 12.5px; margin: 2px 0 8px; } .up { color: var(--c-ok); } .dn { color: var(--c-danger); }
.grp + .grp { margin-top: 14px; } .gl { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--c-muted); margin: 0 0 8px; }
.rg { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; } .rc { border: 1px solid var(--c-rule); padding: 12px 14px; } .rt { display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px; } .rn { font-weight: 600; } .rs { color: var(--c-muted); font-size: 12px; }
.rv { display: flex; align-items: baseline; gap: 10px; margin: 6px 0 4px; flex-wrap: wrap; } .rv b { font-size: 26px; font-weight: 600; } .rv span { font-size: 12.5px; } .rv em { font-style: normal; font-size: 12px; color: var(--c-muted); margin-left: auto; }
.nf { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 12px; } .nf input, .nf select { font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); } .nf input:nth-child(2) { flex: 1; min-width: 220px; } .error { color: var(--c-danger); font-size: 12.5px; }
@media (max-width: 800px) { .mt { grid-template-columns: 1fr; } }
</style>
