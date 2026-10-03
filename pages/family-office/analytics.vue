<script setup lang="ts">
useHead({ title: 'Family Office analytics — Aidi OS' })
const entity = ref('')
const range = ref<'90d' | '12m' | 'all'>('12m')
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { data } = await useFetch<any>('/api/fo-analytics', { query: { entity, range }, watch: [entity, range] })
const usd = (v: number | null | undefined) => (v == null ? '—' : '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'm' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : Math.round(v)))
const lbl = (p: string, monthly = false) => new Date(p + 'T00:00:00Z').toLocaleDateString('en-GB', data.value?.bucket === 'week' && !monthly ? { day: 'numeric', month: 'short', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pts = (s?: { period: string; value: number }[], monthly = false) => (s ?? []).map((x) => ({ label: lbl(x.period, monthly), value: x.value }))
const KIND: Record<string, string> = { holding: 'Holding', operating: 'Operating', fund: 'Fund', gp: 'General partner', management_company: 'Management co.', trust: 'Trust', household: 'Household', spv: 'SPV', other: 'Other' }
const kinds = computed(() => Object.entries((data.value?.entities?.byKind ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]))
const maxOf = (rows: { c: number }[] | undefined) => Math.max(1, ...((rows ?? []).map((r) => r.c)))
const kindMax = computed(() => Math.max(1, ...kinds.value.map(([, c]) => c)))
const RANGE = { '90d': 'last 90 days', '12m': 'last 12 months', all: 'all time' }
</script>

<template>
  <section>
    <p class="label">Family Office</p>
    <div class="head">
      <h1>Analytics</h1>
      <div class="filters">
        <select v-model="entity" aria-label="Entity"><option value="">All entities</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select>
        <select v-model="range" aria-label="Period"><option value="90d">Last 90 days</option><option value="12m">Last 12 months</option><option value="all">All time</option></select>
      </div>
    </div>
    <template v-if="data">
      <div class="kpis">
        <div class="kpi"><span class="label">Active entities</span><b>{{ data.entities.byStatus.active ?? 0 }}</b><span class="sub">{{ data.entities.byStatus.forming ?? 0 }} forming · {{ (data.entities.byStatus.dormant ?? 0) + (data.entities.byStatus.closed ?? 0) }} dormant or closed</span></div>
        <div class="kpi"><span class="label">Group companies</span><b>{{ data.groupCompanies.count }}</b><span class="sub">{{ data.groupCompanies.subsidiaries }} subsidiaries · {{ data.groupCompanies.affiliates }} affiliates</span></div>
        <div class="kpi"><span class="label">Group company revenue</span><b>{{ usd(data.groupCompanies.revenue) }}</b><span class="sub">latest month, combined</span></div>
        <div class="kpi"><span class="label">Group company cash</span><b>{{ usd(data.groupCompanies.cash) }}</b><span class="sub">latest reported, combined</span></div>
        <div class="kpi"><span class="label">Documents</span><b>{{ data.documents.total }}</b><span class="sub">{{ data.documents.added }} added in {{ RANGE[range] }}</span></div>
        <div class="kpi"><span class="label">Protected documents</span><b>{{ data.documents.restricted }}</b><span class="sub">family or restricted</span></div>
      </div>
      <div class="charts">
        <TrendChart title="Group company revenue" sub="Combined, per month" unit="usd" :points="pts(data.groupCompanies.revenueSeries, true)" foot="Subsidiaries and affiliates, as reported" />
        <TrendChart title="Documents added" :sub="data.bucket === 'week' ? 'Per week' : 'Per month'" :points="pts(data.documents.series)" :foot="data.documents.added + ' in ' + RANGE[range]" />
        <TrendChart title="Activity" :sub="data.bucket === 'week' ? 'Actions per week' : 'Actions per month'" :points="pts(data.activity)" foot="Uploads, decisions and changes" />
      </div>
      <div class="three">
        <div class="card"><h3>Entities by type</h3>
          <div v-for="[k, c] in kinds" :key="k" class="bar"><span>{{ KIND[k] ?? k }}</span><i :style="{ width: (c / kindMax) * 100 + '%' }" /><b>{{ c }}</b></div></div>
        <div class="card"><h3>Documents by entity</h3>
          <div v-for="d in data.documents.byEntity" :key="d.name" class="bar"><span>{{ d.name }}</span><i :style="{ width: (d.c / maxOf(data.documents.byEntity)) * 100 + '%' }" /><b>{{ d.c }}</b></div>
          <p v-if="!data.documents.byEntity.length" class="muted">No documents yet.</p></div>
        <div class="card"><h3>Companies held by entity</h3>
          <div v-for="d in data.heldByEntity" :key="d.name" class="bar"><span>{{ d.name }}</span><i :style="{ width: (d.c / maxOf(data.heldByEntity)) * 100 + '%' }" /><b>{{ d.c }}</b></div>
          <p v-if="!data.heldByEntity.length" class="muted">No holdings recorded.</p></div>
      </div>
      <div class="card">
        <h3>Group companies</h3>
        <table v-if="data.groupCompanies.list.length" class="table">
          <thead><tr><th>Company</th><th>Relationship</th><th>Held by</th><th>Revenue (latest)</th><th>Runway</th></tr></thead>
          <tbody><tr v-for="c in data.groupCompanies.list" :key="c.id">
            <td><NuxtLink :to="'/portfolio/' + c.id">{{ c.name }}</NuxtLink></td><td class="cap">{{ c.relationship }}</td><td>{{ c.holder ?? '—' }}</td>
            <td>{{ usd(c.revenue) }}</td><td :class="{ red: c.runway !== null && c.runway < 6 }">{{ c.runway === null ? '—' : c.runway.toFixed(1) + ' mo' }}</td></tr></tbody>
        </table>
        <p v-else class="muted">Add subsidiaries and affiliates (for example Telroi, Termii, Sotel) on Portfolio with the right relationship to see them here.</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; gap: 12px; flex-wrap: wrap; }
.filters { display: flex; gap: 10px; } .filters select { font: inherit; font-size: 13px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-family: var(--font-heading); font-weight: 500; font-size: 30px; color: var(--c-navy); line-height: 1.1; }
.sub { font-size: 12px; color: var(--c-muted); }
.charts, .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
h3 { font-family: var(--font-heading); font-weight: 400; font-size: 20px; color: var(--c-navy); margin: 0 0 12px; }
.bar { display: grid; grid-template-columns: 120px 1fr 28px; gap: 10px; align-items: center; padding: 5px 0; font-size: 13px; }
.bar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar i { display: block; height: 10px; background: var(--c-blue); min-width: 2px; } .bar b { text-align: right; font-weight: 500; }
.table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: var(--type-label); letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); }
td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); } .cap { text-transform: capitalize; } .red { color: var(--c-danger); font-weight: 500; }
.muted { color: var(--c-muted); }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } .charts, .three { grid-template-columns: 1fr; } }
</style>
