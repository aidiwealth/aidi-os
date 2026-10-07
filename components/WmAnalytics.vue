<script setup lang="ts">
// Wealth management analytics (Overview page and the Wealth management overview).
const { data } = await useFetch<Record<string, any>>('/api/wm/analytics', { key: 'wm-analytics' })
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v ?? 0)
</script>
<template>
  <div v-if="data" class="wa">
    <div class="hd"><h2>Wealth management</h2><NuxtLink to="/wealth-mgmt" class="lk">Open →</NuxtLink></div>
    <div class="kp"><NuxtLink to="/wealth-mgmt?t=clients" class="k"><span>Client assets</span><b>{{ usd(data.assets.total) }}</b><em>US {{ usd(data.assets.us) }} · Nigeria {{ usd(data.assets.ng) }}</em></NuxtLink>
      <NuxtLink to="/wealth-mgmt?t=clients" class="k"><span>Clients</span><b>{{ data.clients.active }} active</b><em>{{ data.clients.total }} total · {{ data.clients.kyc_pending }} KYC pending</em></NuxtLink>
      <NuxtLink to="/wealth-mgmt?t=firms" class="k"><span>Fees this year</span><b>{{ usd(data.fees.ytd) }}</b><em :class="{ warn: data.fees.due > 0 }">{{ usd(data.fees.due) }} due</em></NuxtLink>
      <div class="k"><span>Statements &amp; documents</span><b>{{ data.statements_quarter }} this quarter</b><em>{{ data.statements_unseen }} not opened · {{ data.awaiting_signature }} awaiting signature</em></div></div>
    <div class="g3"><div class="card"><DonutChart title="By service model" total-label="Total" currency="USD" :segments="data.assets.by_model" /></div>
      <div class="card"><h3>Client assets over time</h3><AreaTrend v-if="data.history.length > 1" :points="data.history.map((h: any) => ({ x: h.m, y: h.v }))" :height="140" :format="usd" /><p v-else class="mut">Builds month by month as client accounts are valued.</p>
        <div class="split"><span>Invested <b>{{ usd(data.assets.invested) }}</b></span><span>Cash <b>{{ usd(data.assets.cash) }}</b></span></div></div>
      <div class="card"><h3>Largest clients</h3><NuxtLink v-for="t in data.top" :key="t.id" :to="'/wealth-mgmt/clients/' + t.id" class="tr"><span>{{ t.name }} <em>{{ t.country }}</em></span><b>{{ usd(t.net_worth) }}</b></NuxtLink><p v-if="!data.top.length" class="mut">No clients yet.</p></div></div>
  </div>
</template>
<style scoped>
.wa { display: flex; flex-direction: column; gap: 12px; margin: 14px 0; } .hd { display: flex; justify-content: space-between; align-items: baseline; } .hd h2 { margin: 0; font-size: 17px; } .lk { color: var(--c-blue-deep); text-decoration: none; font-size: 13px; }
.kp { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 12px 14px; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 2px; } .k span { font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 20px; } .k em { font-style: normal; font-size: 12px; color: var(--c-muted); } .k em.warn { color: var(--c-warn); }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } h3 { margin: 0 0 8px; font-size: 14.5px; } .mut { color: var(--c-muted); font-size: 12.5px; } .split { display: flex; justify-content: space-between; font-size: 12.5px; margin-top: 8px; color: var(--c-muted); } .split b { color: var(--c-ink); }
.tr { display: flex; justify-content: space-between; padding: 7px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; text-decoration: none; color: inherit; } .tr em { font-style: normal; font-size: 11.5px; color: var(--c-muted); }
@media (max-width: 1000px) { .kp, .g3 { grid-template-columns: 1fr 1fr; } }
</style>
