<script setup lang="ts">
useHead({ title: 'Analytics' })
const entity = ref('')
const range = ref<'90d' | '12m' | 'all'>('12m')
const { data: entities } = await useFetch<{ id: string; name: string; kind: string }[]>('/api/entities')
const funds = computed(() => (entities.value ?? []).filter((e) => e.kind === 'fund' || e.kind === 'spv'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { data, pending } = await useFetch<any>('/api/analytics', { query: { entity, range }, watch: [entity, range] })
const usd = (v: number | null | undefined) => (v == null ? '—' : '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'm' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : Math.round(v)))
const lbl = (p: string) => new Date(p + 'T00:00:00Z').toLocaleDateString('en-GB', data.value?.bucket === 'week' ? { day: 'numeric', month: 'short', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pts = (s?: { period: string; value: number }[]) => (s ?? []).map((x) => ({ label: lbl(x.period), value: x.value }))
const STAGES = [['screening', 'Screening'], ['first_call', 'First call'], ['diligence', 'Diligence'], ['ic', 'IC'], ['invested', 'Invested'], ['passed', 'Passed']] as const
const stageMax = computed(() => Math.max(1, ...STAGES.map(([k]) => Number(data.value?.pipeline?.byStage?.[k] ?? 0))))
const RANGE = { '90d': 'Last 90 days', '12m': 'Last 12 months', all: 'All time' }
const docMax = computed(() => Math.max(1, ...((data.value?.office?.documentsByEntity ?? []) as { c: number }[]).map((x) => x.c)))
</script>

<template>
  <section>
    <p class="label">Venture Capital</p>
    <div class="head">
      <h1>Analytics</h1>
      <div class="filters">
        <select v-model="entity" aria-label="Fund"><option value="">All funds</option><option v-for="e in funds" :key="e.id" :value="e.id">{{ e.name }}</option></select>
        <select v-model="range" aria-label="Period"><option value="90d">Last 90 days</option><option value="12m">Last 12 months</option><option value="all">All time</option></select>
      </div>
    </div>
    <p v-if="pending && !data" class="muted">Loading…</p>

    <template v-if="data?.pitches || data?.pipeline || data?.portfolio">
      <h2 class="sec">Venture Capital</h2>
      <div class="kpis">
        <div v-if="data.pitches" class="kpi"><span class="label">Pitches received</span><b>{{ data.pitches.received }}</b><span class="sub">{{ RANGE[range] }}</span></div>
        <div v-if="data.pitches" class="kpi"><span class="label">Advance rate</span><b>{{ data.pitches.advanceRate == null ? '—' : data.pitches.advanceRate + '%' }}</b><span class="sub">of {{ data.pitches.decided }} decided</span></div>
        <div v-if="data.pitches" class="kpi"><span class="label">Time to decision</span><b>{{ data.pitches.medianDaysToDecision == null ? '—' : data.pitches.medianDaysToDecision + 'd' }}</b><span class="sub">median, pitch to first decision</span></div>
        <div v-if="data.pitches" class="kpi"><span class="label">Avg AI score</span><b>{{ data.pitches.avgScore ?? '—' }}</b><span class="sub">screened pitches</span></div>
        <div v-if="data.pipeline" class="kpi"><span class="label">Active deals</span><b>{{ data.pipeline.active }}</b><span class="sub">screening to IC</span></div>
        <div v-if="data.pipeline" class="kpi"><span class="label">Capital deployed</span><b>{{ usd(data.pipeline.deployed) }}</b><span class="sub">{{ data.pipeline.invested }} {{ data.pipeline.invested === 1 ? 'investment' : 'investments' }}</span></div>
        <div v-if="data.pipeline" class="kpi"><span class="label">Average check</span><b>{{ usd(data.pipeline.avgCheck) }}</b><span class="sub">median post-money {{ usd(data.pipeline.medianValuation) }}</span></div>
        <div v-if="data.pipeline" class="kpi"><span class="label">Win rate</span><b>{{ data.pipeline.winRate == null ? '—' : data.pipeline.winRate + '%' }}</b><span class="sub">invested ÷ closed deals</span></div>
        <div v-if="data.portfolio" class="kpi"><span class="label">Portfolio companies</span><b>{{ data.portfolio.companies }}</b><span class="sub">active</span></div>
        <div v-if="data.portfolio" class="kpi"><span class="label">Portfolio revenue</span><b>{{ usd(data.portfolio.latestRevenue) }}</b><span class="sub">latest month, combined</span></div>
        <div v-if="data.portfolio" class="kpi"><span class="label">Median runway</span><b>{{ data.portfolio.medianRunway == null ? '—' : data.portfolio.medianRunway.toFixed(1) + ' mo' }}</b><span class="sub">{{ usd(data.portfolio.totalCash) }} cash across portfolio</span></div>
        <div v-if="data.portfolio" class="kpi"><span class="label">Reporting</span><b>{{ data.portfolio.reporting.asked ? data.portfolio.reporting.submitted + '/' + data.portfolio.reporting.asked : '—' }}</b><span class="sub">submitted for {{ lbl(data.portfolio.reporting.month) }}</span></div>
      </div>

      <div class="charts">
        <TrendChart v-if="data.pitches" title="Pitches received" :sub="data.bucket === 'week' ? 'Per week' : 'Per month'" :points="pts(data.pitches.series)" :foot="data.pitches.received + ' in ' + RANGE[range].toLowerCase()" />
        <TrendChart v-if="data.pipeline" title="Capital deployed" sub="Cumulative" unit="usd" :points="pts(data.pipeline.deployedSeries)" :foot="data.pipeline.invested + (data.pipeline.invested === 1 ? ' investment' : ' investments')" />
        <TrendChart v-if="data.portfolio" title="Portfolio revenue" sub="Combined, per month" unit="usd" :points="pts(data.portfolio.revenueSeries)" foot="As reported, with team corrections" />
      </div>

      <div class="two">
        <div v-if="data.pipeline" class="card">
          <DonutChart title="Pipeline by stage" total-label="Deals" :segments="STAGES.map(([k, l]) => ({ label: l, value: Number(data.pipeline.byStage[k] ?? 0) }))" />
        </div>
        <div v-if="data.portfolio" class="card">
          <h3>Runway watch</h3>
          <p v-if="!data.portfolio.atRisk.length" class="muted">No company is under 6 months of runway.</p>
          <ul class="risk"><li v-for="r in data.portfolio.atRisk" :key="r.id"><NuxtLink :to="'/portfolio/' + r.id">{{ r.name }}</NuxtLink><span>{{ r.months.toFixed(1) }} months</span></li></ul>
        </div>
      </div>
    </template>

  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; gap: 12px; flex-wrap: wrap; }
.filters { display: flex; gap: 10px; } .filters select { font: inherit; font-size: 13px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.sec { font-size: 13px; letter-spacing: 0; font-family: var(--font-body); color: var(--c-muted); font-weight: 500; margin: 8px 0 12px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-weight: 500; letter-spacing: -0.02em; font-size: 30px; color: var(--c-navy); line-height: 1.1; }
.sub { font-size: 12px; color: var(--c-muted); }
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
h3 { font-family: var(--font-heading); font-size: 20px; font-weight: 500; color: var(--c-navy); margin: 0 0 12px; }
.bar { display: grid; grid-template-columns: 130px 1fr 32px; gap: 10px; align-items: center; padding: 5px 0; font-size: 13px; }
.bar i { display: block; height: 10px; background: var(--c-blue); min-width: 2px; } .bar b { text-align: right; font-weight: 500; }
.risk { list-style: none; padding: 0; margin: 0; } .risk li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--c-rule); }
.risk span { color: var(--c-danger); font-weight: 500; }
.muted { color: var(--c-muted); }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } .charts, .two { grid-template-columns: 1fr; } }
</style>
