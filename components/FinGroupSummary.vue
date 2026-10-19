<script setup lang="ts">
// Group overview for a company with subsidiaries: the group's revenue, profit and cash converted to one currency, for
// the latest month every entity has reported, and each entity in its own currency beside the converted figure.
interface Ent { id: string; name: string; main: boolean; currency: string; rate: number | null; latest: string | null; revenue: number | null; net_income: number | null; cash: number | null; cash_at: string | null; ttm_revenue: number | null; revenue_conv: number | null; net_income_conv: number | null; cash_conv: number | null; ttm_conv: number | null; at_common: { revenue: number | null; net_income: number | null; cash: number | null } | null; behind: boolean }
interface G { currency: string; rate_as_of: string | null; common: string | null; entities: Ent[]; total: { month: string; revenue: number; net_income: number; cash: number; entities: number } | null; ttm: number; series: { month: string; revenue: number; net_income: number; cash: number; entities: number }[]; missing_rate: string[]; without_figures: string[] }
const emit = defineEmits<{ open: [subject: string] }>()
const { data: g } = await useFetch<G | null>('/api/financials/group-summary', { server: false })
const mon = (m: string | null, long = false) => (m ? new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const money = (v: number | null | undefined, c: string) => (v == null ? '—' : briefMoney(v, c))
const share = (e: Ent) => (g.value?.total?.revenue && e.at_common?.revenue != null ? Math.max(0, e.at_common.revenue / g.value.total.revenue) : 0)
// The chart shows only months every company has reported, so a missing subsidiary month is not a drop.
const full = computed(() => { const n = (g.value?.entities ?? []).filter((e) => e.latest).length; const s = (g.value?.series ?? []).filter((x) => x.entities === n); return s.length >= 2 ? s : [] })
const behind = computed(() => (g.value?.entities ?? []).filter((e) => e.behind))
const sym = computed(() => ({ USD: '$', NGN: '₦', GBP: '£', EUR: '€' } as Record<string, string>)[g.value?.currency ?? 'USD'] ?? (g.value?.currency ?? '') + ' ')
</script>

<template>
  <div v-if="g && g.common" class="card gs">
    <div class="gh"><div><span class="eyebrow">Group overview · {{ g.currency }}</span><h3>{{ mon(g.common, true) }}, all {{ g.entities.length }} companies together</h3>
      <p class="mut">Each company's figures converted to {{ g.currency }} at the latest daily rate{{ g.rate_as_of ? ' (' + new Date(g.rate_as_of).toLocaleDateString('en-GB') + ')' : '' }}, for the latest month every company has reported. Intercompany amounts are not taken out.</p></div>
      <button type="button" class="btn secondary sm" @click="emit('open', 'group')">Open group figures</button></div>
    <div class="gt">
      <div><span>Revenue · {{ mon(g.common) }}</span><b>{{ money(g.total?.revenue, g.currency) }}</b></div>
      <div><span>Net income · {{ mon(g.common) }}</span><b :class="{ neg: (g.total?.net_income ?? 0) < 0 }">{{ money(g.total?.net_income, g.currency) }}</b></div>
      <div><span>Cash</span><b>{{ money(g.total?.cash, g.currency) }}</b></div>
      <div><span>Revenue, last 12 months</span><b>{{ money(g.ttm, g.currency) }}</b></div>
    </div>
    <div class="gw">
      <table class="t" data-nosearch><thead><tr><th>Company</th><th class="r">Revenue ({{ mon(g.common) }})</th><th class="r">In {{ g.currency }}</th><th class="r">Net income</th><th class="r">Cash</th><th>Share of revenue</th></tr></thead>
        <tbody><tr v-for="e in g.entities" :key="e.id">
          <td><button type="button" class="lk" @click="emit('open', 'entity:' + e.id)">{{ e.name }}</button><span class="sub">{{ e.main ? 'Company' : 'Subsidiary' }} · {{ e.currency }}{{ e.latest ? ' · figures to ' + mon(e.latest) : ' · no figures yet' }}</span></td>
          <td class="r">{{ e.currency === g.currency ? '' : money(e.at_common?.revenue != null && e.rate ? Math.round(e.at_common.revenue / e.rate) : null, e.currency) }}</td>
          <td class="r"><b>{{ money(e.at_common?.revenue, g.currency) }}</b></td>
          <td class="r" :class="{ neg: (e.at_common?.net_income ?? 0) < 0 }">{{ money(e.at_common?.net_income, g.currency) }}</td>
          <td class="r">{{ money(e.at_common?.cash, g.currency) }}</td>
          <td><span class="bar"><i :style="{ width: Math.round(share(e) * 100) + '%' }" /></span>{{ Math.round(share(e) * 100) }}%</td></tr></tbody></table>
      <TrendChart v-if="full.length" title="Group revenue" unit="usd" :symbol="sym" :points="full.map((x) => ({ label: mon(x.month), value: x.revenue }))" :foot="'Months every company reported, in ' + g.currency" :foot-value="g.total?.revenue ?? null" />
    </div>
    <p v-if="behind.length" class="note">{{ behind.map((e) => e.name).join(', ') }} {{ behind.length === 1 ? 'has' : 'have' }} figures only to {{ mon(behind[0]!.latest) }}, so the group is shown for {{ mon(g.common) }}. Add their later months to see the group for the latest month.</p>
    <p v-if="g.without_figures.length" class="note">No figures yet for {{ g.without_figures.join(', ') }}: not included.</p>
    <p v-if="g.missing_rate.length" class="note">No exchange rate for {{ g.missing_rate.join(', ') }} yet: those figures are left out of the totals.</p>
  </div>
</template>

<style scoped>
.gs { display: flex; flex-direction: column; gap: 14px; margin-bottom: 14px; } .gh { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; } .gh h3 { margin: 2px 0 4px; font-size: 17px; font-weight: 500; color: var(--c-navy); }
.eyebrow { font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); } .mut { color: var(--c-muted); font-size: 13px; margin: 0; max-width: 760px; }
.gt { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--c-rule); } .gt > div { padding: 12px 14px; border-right: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 3px; } .gt > div:last-child { border-right: 0; }
.gt span { font-size: 13px; font-weight: 500; color: var(--c-muted); } .gt b { font-family: var(--font-heading); font-size: 26px; line-height: 1.15; font-weight: 500; letter-spacing: -.02em; color: var(--c-navy); font-variant-numeric: tabular-nums; } .neg { color: var(--c-danger) !important; }
.gw { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; align-items: start; } .t { width: 100%; border-collapse: collapse; font-size: 13.5px; } .t th { text-align: left; font-weight: 500; color: var(--c-muted); font-size: 12px; padding: 8px 10px; border-bottom: 1px solid var(--c-rule); } .t th.r, .r { text-align: right; }
.t td { padding: 9px 10px; border-bottom: 1px solid var(--c-rule); vertical-align: top; font-variant-numeric: tabular-nums; } .sub { display: block; font-size: 11.5px; color: var(--c-muted); }
.bar { display: inline-block; width: 70px; height: 6px; background: var(--c-paper-2, #f4f6fa); margin-right: 8px; vertical-align: middle; } .bar i { display: block; height: 100%; background: var(--c-navy); }
.lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; text-align: left; } .btn.sm { padding: 5px 10px; font-size: 12.5px; }
.note { margin: 0; font-size: 12.5px; color: var(--c-warn); }
@media (max-width: 1000px) { .gw { grid-template-columns: 1fr; } .gt { grid-template-columns: 1fr 1fr; } }
</style>
