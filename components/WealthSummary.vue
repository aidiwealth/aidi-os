<script setup lang="ts">
// Net worth, cash against invested, by asset class and by platform (all in USD).
defineProps<{ s: { totals: { net_worth: number; invested: number; cash: number; cost: number; gain: number; liabilities: number }; by_class: { label: string; value: number }[]; by_platform: { label: string; value: number }[] } }>()
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
</script>
<template>
  <div class="ws"><div class="kp"><div class="k main"><span>Net worth</span><b>{{ usd(s.totals.net_worth) }}</b><em>in US dollars</em></div><div class="k"><span>Invested</span><b>{{ usd(s.totals.invested) }}</b><em :class="{ up: s.totals.gain >= 0, dn: s.totals.gain < 0 }">{{ s.totals.gain >= 0 ? '+' : '' }}{{ usd(s.totals.gain) }} on cost</em></div><div class="k"><span>Cash</span><b>{{ usd(s.totals.cash) }}</b><em>banks and savings</em></div><div v-if="s.totals.liabilities" class="k"><span>Liabilities</span><b>{{ usd(s.totals.liabilities) }}</b></div></div>
    <div class="ch"><div class="card"><DonutChart title="By asset class" total-label="Total" currency="USD" :segments="s.by_class" /></div>
      <div class="card"><h3>Where it is held</h3><div v-for="p in s.by_platform" :key="p.label" class="pl"><span>{{ p.label }}</span><b>{{ usd(p.value) }}</b></div><p v-if="!s.by_platform.length" class="mut">Nothing recorded yet.</p></div></div></div>
</template>
<style scoped>
.kp { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; } .k span { display: block; font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 24px; font-weight: 600; } .k.main b { color: var(--c-blue-deep); } .k em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .k em.up { color: var(--c-ok); } .k em.dn { color: var(--c-danger); }
.ch { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; margin-top: 12px; } .ch h3 { margin: 0 0 8px; font-size: 15px; } .pl { display: flex; justify-content: space-between; padding: 7px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .mut { color: var(--c-muted); font-size: 13px; }
@media (max-width: 900px) { .ch { grid-template-columns: 1fr; } }
</style>
