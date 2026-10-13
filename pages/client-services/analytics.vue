<script setup lang="ts">
useHead({ title: 'Client Services analytics' })
const entity = ref('')
const range = ref<'90d' | '12m' | 'all'>('all')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { data } = await useFetch<any>('/api/cs-analytics', { query: { entity, range }, watch: [entity, range] })
const usd = (v: number | null | undefined) => (v == null ? '—' : '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'm' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : Math.round(v)))
const lbl = (p: string) => new Date(p + 'T00:00:00Z').toLocaleDateString('en-GB', data.value?.bucket === 'week' ? { day: 'numeric', month: 'short', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pts = (s?: { period: string; value: number }[]) => (s ?? []).map((x) => ({ label: lbl(x.period), value: x.value }))
const STATUS = [['new', 'New'], ['in_progress', 'In progress'], ['waiting_client', 'Waiting on client'], ['completed', 'Completed'], ['cancelled', 'Cancelled']] as const
const statusMax = computed(() => Math.max(1, ...STATUS.map(([k]) => Number(data.value?.byStatus?.[k] ?? 0))))
const svcMax = computed(() => Math.max(1, ...((data.value?.byService ?? []) as { c: number }[]).map((r) => r.c)))
const RANGE = { '90d': 'last 90 days', '12m': 'last 12 months', all: 'all time' }
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
</script>

<template>
  <section>
    <p class="label">Client Services</p>
    <div class="head">
      <h1>Analytics</h1>
      <div class="filters">
        <select v-model="range" aria-label="Period"><option value="90d">Last 90 days</option><option value="12m">Last 12 months</option><option value="all">All time</option></select>
      </div>
    </div>
    <template v-if="data">
      <div class="fx-stats">
        <StatTile label="Open jobs" :value="data.kpis.open" :note="data.kpis.clients + ' active clients'" icon="briefcase" tone="n" />
        <StatTile label="Overdue" :value="data.kpis.overdue" :red="!!data.kpis.overdue" note="past their due date" icon="alert" :tone="data.kpis.overdue ? 'r' : 'g'" />
        <StatTile label="Waiting on clients" :value="data.kpis.waiting" note="blocked on the client" icon="clock" tone="a" />
        <StatTile label="Turnaround" :value="data.kpis.avgDays == null ? '—' : data.kpis.avgDays + 'd'" note="average days, opened to completed" icon="calendar" tone="b" />
        <StatTile label="Fees earned" :value="usd(data.kpis.fees)" :note="'paid by clients, ' + RANGE[range]" icon="money" tone="g" />
      </div>
      <div class="charts">
        <TrendChart title="Completed" :sub="data.bucket === 'week' ? 'Per week' : 'Per month'" :points="pts(data.completedSeries)" :foot="data.kpis.completed + ' in ' + RANGE[range]" />
        <TrendChart title="Fees earned" :sub="data.bucket === 'week' ? 'Per week' : 'Per month'" unit="usd" :points="pts(data.feeSeries)" foot="When paid" />
      </div>
      <div class="three">
        <div class="card"><DonutChart title="Open jobs by service" total-label="Open jobs" :segments="data.byService.map((s: any) => ({ label: s.label, value: s.c }))" /></div>
        <div class="card"><DonutChart title="Jobs by status" total-label="Jobs" :segments="STATUS.map(([k, l]) => ({ label: l, value: Number(data.byStatus[k] ?? 0) }))" /></div>
        <div class="card"><h3>Top clients</h3>
          <ul class="list"><li v-for="c in data.topClients" :key="c.name"><span>{{ c.name }}<em>{{ c.jobs }} job{{ c.jobs === 1 ? '' : 's' }}</em></span><b>{{ usd(c.fees) }}</b></li></ul>
          <p v-if="!data.topClients.length" class="muted">No clients in this period.</p></div>
      </div>
      <div class="card">
        <h3>Overdue jobs</h3>
        <ul v-if="data.overdue.length" class="list"><li v-for="j in data.overdue" :key="j.id"><span><NuxtLink :to="'/services/' + j.id">{{ j.title }}</NuxtLink><em>{{ j.client }}</em></span><b class="red">due {{ day(j.due_date) }}</b></li></ul>
        <p v-else class="muted">Nothing overdue.</p>
      </div>
    </template>
  </section>
</template>

<style>.ovtab .head > h1, .ovtab section > p.label:first-child { display: none; } .ovtab .head { justify-content: flex-end; } .ovtab .kpis { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)) !important; gap: 12px; } .ovtab .charts { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important; gap: 12px; } .ovtab .three, .ovtab .two { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important; gap: 12px; } .ovtab .kpi { min-width: 0; } .ovtab .kpi b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }</style>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; gap: 12px; flex-wrap: wrap; }
.filters { display: flex; gap: 10px; } .filters select { font: inherit; font-size: 13px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.charts, .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
h3 { font-family: var(--font-heading); font-size: 20px; font-weight: 500; color: var(--c-navy); margin: 0 0 12px; }
.bar { display: grid; grid-template-columns: 130px 1fr 28px; gap: 10px; align-items: center; padding: 5px 0; font-size: 13px; }
.bar i { display: block; height: 10px; background: var(--c-blue); min-width: 2px; } .bar b { text-align: right; font-weight: 500; }
.list { list-style: none; padding: 0; margin: 0; } .list li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); }
.list em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .list b { font-weight: 500; white-space: nowrap; }
.red { color: var(--c-danger) !important; } .muted { color: var(--c-muted); }
@media (max-width: 1100px) { .charts, .three { grid-template-columns: 1fr; } }
</style>
