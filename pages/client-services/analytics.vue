<script setup lang="ts">
useHead({ title: 'Client Services analytics' })
const entity = ref('')
const range = ref<'90d' | '12m' | 'all'>('12m')
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
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
        <select v-model="entity" aria-label="Delivered by"><option value="">All delivering entities</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select>
        <select v-model="range" aria-label="Period"><option value="90d">Last 90 days</option><option value="12m">Last 12 months</option><option value="all">All time</option></select>
      </div>
    </div>
    <template v-if="data">
      <div class="kpis">
        <div class="kpi"><span class="label">Open jobs</span><b>{{ data.kpis.open }}</b><span class="sub">{{ data.kpis.clients }} active clients</span></div>
        <div class="kpi"><span class="label">Overdue</span><b :class="{ red: data.kpis.overdue }">{{ data.kpis.overdue }}</b><span class="sub">past their due date</span></div>
        <div class="kpi"><span class="label">Waiting on clients</span><b>{{ data.kpis.waiting }}</b><span class="sub">blocked on the client</span></div>
        <div class="kpi"><span class="label">Turnaround</span><b>{{ data.kpis.avgDays == null ? '—' : data.kpis.avgDays + 'd' }}</b><span class="sub">average, open to completed</span></div>
        <div class="kpi"><span class="label">New jobs</span><b>{{ data.kpis.created }}</b><span class="sub">{{ RANGE[range] }}</span></div>
        <div class="kpi"><span class="label">Completed</span><b>{{ data.kpis.completed }}</b><span class="sub">{{ RANGE[range] }}</span></div>
        <div class="kpi"><span class="label">Fees earned</span><b>{{ usd(data.kpis.fees) }}</b><span class="sub">on jobs completed, {{ RANGE[range] }}</span></div>
        <div class="kpi"><span class="label">Fees in progress</span><b>{{ usd(data.kpis.pipelineFees) }}</b><span class="sub">on open jobs</span></div>
      </div>
      <div class="charts">
        <TrendChart title="New jobs" :sub="data.bucket === 'week' ? 'Per week' : 'Per month'" :points="pts(data.createdSeries)" :foot="data.kpis.created + ' in ' + RANGE[range]" />
        <TrendChart title="Completed" :sub="data.bucket === 'week' ? 'Per week' : 'Per month'" :points="pts(data.completedSeries)" :foot="data.kpis.completed + ' in ' + RANGE[range]" />
        <TrendChart title="Fees earned" :sub="data.bucket === 'week' ? 'Per week' : 'Per month'" unit="usd" :points="pts(data.feeSeries)" foot="On completion" />
      </div>
      <div class="three">
        <div class="card"><h3>Open jobs by service</h3>
          <div v-for="s in data.byService" :key="s.label" class="bar"><span>{{ s.label }}</span><i :style="{ width: (s.c / svcMax) * 100 + '%' }" /><b>{{ s.c }}</b></div>
          <p v-if="!data.byService.length" class="muted">No open jobs.</p></div>
        <div class="card"><h3>Jobs by status</h3>
          <div v-for="[k, l] in STATUS" :key="k" class="bar"><span>{{ l }}</span><i :style="{ width: (Number(data.byStatus[k] ?? 0) / statusMax) * 100 + '%' }" /><b>{{ data.byStatus[k] ?? 0 }}</b></div></div>
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

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; gap: 12px; flex-wrap: wrap; }
.filters { display: flex; gap: 10px; } .filters select { font: inherit; font-size: 13px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-weight: 500; letter-spacing: -0.02em; font-size: 30px; color: var(--c-navy); line-height: 1.1; }
.sub { font-size: 12px; color: var(--c-muted); }
.charts, .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
h3 { font-family: var(--font-heading); font-size: 20px; font-weight: 500; color: var(--c-navy); margin: 0 0 12px; }
.bar { display: grid; grid-template-columns: 130px 1fr 28px; gap: 10px; align-items: center; padding: 5px 0; font-size: 13px; }
.bar i { display: block; height: 10px; background: var(--c-blue); min-width: 2px; } .bar b { text-align: right; font-weight: 500; }
.list { list-style: none; padding: 0; margin: 0; } .list li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); }
.list em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .list b { font-weight: 500; white-space: nowrap; }
.red { color: var(--c-danger) !important; } .muted { color: var(--c-muted); }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } .charts, .three { grid-template-columns: 1fr; } }
</style>
