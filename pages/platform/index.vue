<script setup lang="ts">
useHead({ title: 'Finvry · Overview' })
interface O { kpis: { total: number; active: number; trial: number; past_due: number; suspended: number; new30: number; seats: number; mrr: number; arr: number; newMrr: number; churnMrr: number; pipelineOpen: number; pipeline: number; weighted: number; overdueCount: number; overdue: number }
  mrrSeries: { period: string; value: number }[]; renewals: { id: string; customer: string; organization_id: string; renews: string; amount_usd: string; billing: string }[]
  byPlan: { plan: string; n: number }[]; trials: { id: string; name: string; ends: string | null }[]; recent: { id: string; name: string; status: string; plan: string }[] }
const { data } = await useFetch<O>('/api/platform/overview')
const usd = (v: number | string) => { const n = Number(v); return '$' + (n >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString()) }
const pts = (s?: { period: string; value: number }[]) => (s ?? []).map((x) => ({ label: new Date(x.period + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: x.value }))
const max = computed(() => Math.max(1, ...(data.value?.byPlan ?? []).map((p) => p.n)))
const day = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
</script>

<template>
  <section v-if="data">
    <p class="label">Finvry platform</p>
    <div class="head"><h1>Overview</h1><div class="tools"><NuxtLink to="/platform/pipeline?new=1" class="btn secondary">New lead</NuxtLink><NuxtLink to="/platform/customers?new=1" class="btn">New customer</NuxtLink></div></div>
    <div class="kpis">
      <div class="kpi"><span class="label">MRR</span><b>{{ usd(data.kpis.mrr) }}</b><span class="sub">ARR {{ usd(data.kpis.arr) }}</span></div>
      <div class="kpi"><span class="label">This month</span><b class="pos">+{{ usd(data.kpis.newMrr) }}</b><span class="sub" :class="{ neg: data.kpis.churnMrr }">−{{ usd(data.kpis.churnMrr) }} churned</span></div>
      <div class="kpi"><span class="label">Customers</span><b>{{ data.kpis.active }}</b><span class="sub">{{ data.kpis.trial }} on trial · {{ data.kpis.past_due }} past due</span></div>
      <div class="kpi"><span class="label">Pipeline</span><b>{{ usd(data.kpis.weighted) }}</b><span class="sub">weighted MRR · {{ data.kpis.pipelineOpen }} open deals ({{ usd(data.kpis.pipeline) }})</span></div>
    </div>
    <div class="charts">
      <TrendChart title="Monthly recurring revenue" sub="Last 12 months" unit="usd" :points="pts(data.mrrSeries)" :foot="data.kpis.seats + ' seats in use'" />
      <div class="card"><h3>Customers by plan</h3>
        <div v-for="p in data.byPlan" :key="p.plan" class="bar"><span>{{ p.plan }}</span><i :style="{ width: (p.n / max) * 100 + '%' }" /><b>{{ p.n }}</b></div>
        <p v-if="data.kpis.overdueCount" class="warn"><NuxtLink to="/platform/billing">{{ data.kpis.overdueCount }} overdue invoice{{ data.kpis.overdueCount === 1 ? '' : 's' }} · {{ usd(data.kpis.overdue) }}</NuxtLink></p></div>
    </div>
    <div class="three">
      <div class="card"><h3>Renewals in 30 days</h3>
        <ul v-if="data.renewals.length" class="list"><li v-for="r in data.renewals" :key="r.id"><NuxtLink :to="'/platform/customers/' + r.organization_id">{{ r.customer }}</NuxtLink><span class="nc">{{ day(r.renews) }} · {{ usd(r.amount_usd) }} / {{ r.billing === 'annual' ? 'year' : 'month' }}</span></li></ul>
        <p v-else class="muted">None due.</p></div>
      <div class="card"><h3>Trials</h3>
        <ul v-if="data.trials.length" class="list"><li v-for="t in data.trials" :key="t.id"><NuxtLink :to="'/platform/customers/' + t.id">{{ t.name }}</NuxtLink><span>ends {{ day(t.ends) }}</span></li></ul>
        <p v-else class="muted">No trials running.</p></div>
      <div class="card"><h3>Newest customers</h3>
        <ul v-if="data.recent.length" class="list"><li v-for="r in data.recent" :key="r.id"><NuxtLink :to="'/platform/customers/' + r.id">{{ r.name }}</NuxtLink><span>{{ r.plan }} · {{ r.status }}</span></li></ul>
        <p v-else class="muted">No customers yet.</p></div>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; } .tools { display: flex; gap: 10px; } .tools .btn { text-decoration: none; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-family: var(--font-heading); font-weight: 500; font-size: 30px; color: var(--c-navy); } .sub { font-size: 12px; color: var(--c-muted); }
.pos { color: var(--c-ok) !important; } .neg { color: var(--c-danger) !important; }
.charts { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 16px; } .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
h3 { font-family: var(--font-heading); font-weight: 400; font-size: 20px; color: var(--c-navy); margin: 0 0 12px; }
.bar { display: grid; grid-template-columns: 110px 1fr 28px; gap: 10px; align-items: center; padding: 5px 0; font-size: 13px; }
.bar i { display: block; height: 10px; background: var(--c-blue); min-width: 2px; } .bar b { text-align: right; font-weight: 500; }
.warn { margin: 14px 0 0; font-size: 13px; } .warn a { color: var(--c-danger); }
.list { list-style: none; padding: 0; margin: 0; } .list li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .list span { color: var(--c-muted); font-size: 12.5px; text-transform: capitalize; white-space: nowrap; } .list span.nc { text-transform: none; }
.muted { color: var(--c-muted); }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } .charts, .three { grid-template-columns: 1fr; } }
</style>
