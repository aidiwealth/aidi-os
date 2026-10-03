<script setup lang="ts">
useHead({ title: 'Finvry · Overview' })
interface O { kpis: { total: number; active: number; trial: number; past_due: number; suspended: number; new30: number; seats: number; mrr: number }
  byPlan: { plan: string; n: number }[]; trials: { id: string; name: string; ends: string | null }[]; recent: { id: string; name: string; status: string; plan: string; created_at: string }[]; signups: { period: string; value: number }[] }
const { data } = await useFetch<O>('/api/platform/overview')
const usd = (v: number) => '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'm' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : Math.round(v))
const pts = (s?: { period: string; value: number }[]) => (s ?? []).map((x) => ({ label: new Date(x.period + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: x.value }))
const max = computed(() => Math.max(1, ...(data.value?.byPlan ?? []).map((p) => p.n)))
const day = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
</script>

<template>
  <section v-if="data">
    <p class="label">Finvry platform</p>
    <div class="head"><h1>Overview</h1><NuxtLink to="/platform/customers?new=1" class="btn">New customer</NuxtLink></div>
    <div class="kpis">
      <div class="kpi"><span class="label">MRR (list price)</span><b>{{ usd(data.kpis.mrr) }}</b><span class="sub">ARR {{ usd(data.kpis.mrr * 12) }}</span></div>
      <div class="kpi"><span class="label">Paying customers</span><b>{{ data.kpis.active }}</b><span class="sub">{{ data.kpis.past_due }} past due</span></div>
      <div class="kpi"><span class="label">On trial</span><b>{{ data.kpis.trial }}</b><span class="sub">{{ data.kpis.new30 }} new in 30 days</span></div>
      <div class="kpi"><span class="label">Seats in use</span><b>{{ data.kpis.seats }}</b><span class="sub">{{ data.kpis.suspended }} suspended workspaces</span></div>
    </div>
    <div class="charts">
      <TrendChart title="New customers" sub="Per month" :points="pts(data.signups)" :foot="data.kpis.total + ' customers in total'" />
      <div class="card"><h3>Customers by plan</h3>
        <div v-for="p in data.byPlan" :key="p.plan" class="bar"><span>{{ p.plan }}</span><i :style="{ width: (p.n / max) * 100 + '%' }" /><b>{{ p.n }}</b></div>
        <p class="muted small">Subscription billing, renewals and the sales pipeline arrive next.</p></div>
    </div>
    <div class="two">
      <div class="card"><h3>Trials</h3>
        <ul v-if="data.trials.length" class="list"><li v-for="t in data.trials" :key="t.id"><NuxtLink :to="'/platform/customers/' + t.id">{{ t.name }}</NuxtLink><span>ends {{ day(t.ends) }}</span></li></ul>
        <p v-else class="muted">No trials running.</p></div>
      <div class="card"><h3>Newest customers</h3>
        <ul v-if="data.recent.length" class="list"><li v-for="r in data.recent" :key="r.id"><NuxtLink :to="'/platform/customers/' + r.id">{{ r.name }}</NuxtLink><span>{{ r.plan }} · {{ r.status }}</span></li></ul>
        <p v-else class="muted">No customers yet. Create the first one.</p></div>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; } .head .btn { text-decoration: none; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-family: var(--font-heading); font-weight: 500; font-size: 30px; color: var(--c-navy); } .sub { font-size: 12px; color: var(--c-muted); }
.charts { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 16px; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
h3 { font-family: var(--font-heading); font-weight: 400; font-size: 20px; color: var(--c-navy); margin: 0 0 12px; }
.bar { display: grid; grid-template-columns: 110px 1fr 28px; gap: 10px; align-items: center; padding: 5px 0; font-size: 13px; }
.bar i { display: block; height: 10px; background: var(--c-blue); min-width: 2px; } .bar b { text-align: right; font-weight: 500; }
.list { list-style: none; padding: 0; margin: 0; } .list li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .list span { color: var(--c-muted); font-size: 12.5px; text-transform: capitalize; }
.muted { color: var(--c-muted); } .small { font-size: 12.5px; margin: 12px 0 0; }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } .charts, .two { grid-template-columns: 1fr; } }
</style>
