<script setup lang="ts">
// Live gold and silver prices (with their growth) and interest rates: US T-bills (from the US Treasury), plus rates
// staff record (Nigerian T-bills, bank CDs, savings rates).
const props = defineProps<{ editable?: boolean; country?: 'US' | 'NG' | null }>()
interface M { price: number; as_of: string; day_change_pct: number | null; since_pct: number | null; since: string | null; series: { d: string; price: number }[] }
interface R { country: string; product: string; source: string | null; points: { as_of: string; rate: number }[]; latest: { as_of: string; rate: number } | null }
const { data, refresh } = await useFetch<{ metals: { gold: M | null; silver: M | null }; rates: R[] }>(() => '/api/wm/market' + (props.country ? '?country=' + props.country : ''), { key: 'wm-market-' + (props.country ?? 'all') })
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v)
const pct = (v: number | null) => (v == null ? '' : (v > 0 ? '+' : '') + v.toFixed(2) + '%')
const nf = reactive({ open: false, country: 'NG', product: 'Nigerian T-bills (364-day)', rate: '' as string | number, as_of: new Date().toISOString().slice(0, 10), source: '' }); const msg = ref('')
async function addRate() { msg.value = ''; try { await $fetch('/api/wm/rates', { method: 'POST', body: { country: nf.country, product: nf.product, rate: Number(nf.rate), as_of: nf.as_of, source: nf.source } }); nf.open = false; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
</script>
<template>
  <div v-if="data" class="mw">
    <div class="mt"><div v-for="[k, l] in [['gold', 'Gold'], ['silver', 'Silver']]" :key="k" class="card mc"><div class="mh"><b>{{ l }}</b><span class="mut">USD / oz · live</span></div>
        <template v-if="data.metals[k as 'gold']"><div class="pr">{{ usd(data.metals[k as 'gold']!.price) }} <em :class="(data.metals[k as 'gold']!.day_change_pct ?? 0) >= 0 ? 'up' : 'dn'">{{ pct(data.metals[k as 'gold']!.day_change_pct) }}</em></div>
          <MiniLine :values="data.metals[k as 'gold']!.series.map((x) => x.price)" :color="k === 'gold' ? '#b8860b' : '#6b7280'" /><span class="mut">{{ data.metals[k as 'gold']!.series.length > 1 ? pct(data.metals[k as 'gold']!.since_pct) + ' since ' + data.metals[k as 'gold']!.since : 'History builds from today' }}</span></template>
        <p v-else class="mut">Live price unavailable right now.</p></div></div>
    <div class="card rc"><div class="mh"><b>Interest rates</b><button v-if="editable" class="lk" @click="nf.open = !nf.open">{{ nf.open ? 'Close' : '+ Record a rate' }}</button></div>
      <div v-if="nf.open" class="nf"><select v-model="nf.country"><option value="NG">Nigeria</option><option value="US">United States</option></select><input v-model="nf.product" placeholder="Product, e.g. Nigerian T-bills (364-day), 12-month bank CD"><input v-model="nf.rate" type="number" step="0.01" placeholder="Rate %"><input v-model="nf.as_of" type="date"><input v-model="nf.source" placeholder="Source (CBN, bank…)"><button class="btn sm" :disabled="!nf.product || nf.rate === ''" @click="addRate">Save</button><span v-if="msg" class="error">{{ msg }}</span></div>
      <div class="rg"><div v-for="r in data.rates" :key="r.country + r.product" class="ri"><div class="rh"><span>{{ r.product }}<em>{{ r.country === 'US' ? 'United States' : 'Nigeria' }}{{ r.source ? ' · ' + r.source : '' }}</em></span><b>{{ r.latest ? r.latest.rate.toFixed(2) + '%' : '—' }}</b></div><MiniLine :values="r.points.map((p) => p.rate)" :height="40" /><span class="mut">{{ r.latest?.as_of }}{{ r.points.length > 1 ? ' · was ' + r.points[0]!.rate.toFixed(2) + '% on ' + r.points[0]!.as_of : '' }}</span></div></div>
      <p v-if="!data.rates.length" class="mut">No rates yet. US T-bill rates load from the US Treasury; record Nigerian T-bills, bank CDs and savings rates here.</p></div>
  </div>
</template>
<style scoped>
.mw { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; } .mt { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; } .mc { display: flex; flex-direction: column; gap: 4px; } .mh { display: flex; justify-content: space-between; align-items: center; } .mut { color: var(--c-muted); font-size: 12px; }
.pr { font-size: 24px; font-weight: 600; } .pr em { font-style: normal; font-size: 13px; margin-left: 6px; } .up { color: var(--c-ok); } .dn { color: var(--c-danger); }
.rg { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin-top: 8px; } .ri { border-top: 1px solid var(--c-rule); padding-top: 8px; } .rh { display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px; } .rh em { display: block; font-style: normal; font-size: 11.5px; color: var(--c-muted); } .rh b { font-size: 17px; }
.nf { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; } .nf input, .nf select { font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); } .nf input:nth-child(2) { flex: 1; min-width: 220px; } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; } .error { color: var(--c-danger); font-size: 12.5px; }
@media (max-width: 800px) { .mt { grid-template-columns: 1fr; } }
</style>
