<script setup lang="ts">
useHead({ title: 'Family Office analytics' })
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
const money = (v: number, c: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: c, notation: Math.abs(v) >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(v) >= 1e6 ? 1 : 0 }).format(v)
const cashCurrencies = computed(() => Object.keys((data.value?.cash?.byCurrency ?? {}) as Record<string, number>).sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))))
const day = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'never')
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
      <template v-if="data.cash">
        <h2 class="sec">Group cash</h2>
        <div v-if="cashCurrencies.length" class="kpis">
          <div v-for="c in cashCurrencies" :key="c" class="kpi"><span class="label">Cash · {{ c }}</span><b>{{ money(data.cash.byCurrency[c], c) }}</b><span class="sub">latest tied-out statements</span></div>
        </div>
        <EmptyState v-else compact icon="empty" title="No bank statements yet. Add accounts and import statements on Bank &amp; cash" />
        <div v-if="cashCurrencies.length" class="charts">
          <TrendChart v-for="c in cashCurrencies.slice(0, 3)" :key="c" :title="'Cash · ' + c" sub="Month-end, last 12 months" :points="pts(data.cash.series[c], true)" :foot="'Across ' + data.cash.accounts + ' accounts'" />
        </div>
        <div v-if="cashCurrencies.length" class="three">
          <div class="card cashent"><DonutChart :title="'Cash by entity · ' + cashCurrencies[0]" :currency="cashCurrencies[0]" :segments="data.cash.byEntity.map((e: any) => ({ label: e.name, value: Number(e.totals[cashCurrencies[0]!] ?? 0) }))" /></div>
          <div class="card"><h3>Statements out of date</h3>
            <ul v-if="data.cash.stale.length" class="stale"><li v-for="s in data.cash.stale" :key="s.id"><NuxtLink :to="'/banking/' + s.id">{{ s.label }}</NuxtLink><span>{{ s.entity }} · last statement {{ day(s.as_of) }}</span></li></ul>
            <p v-else class="muted">Every account has a statement from the last 45 days.</p></div>
        </div>
        <h2 class="sec">Entities, documents and group companies</h2>
      </template>
      <div class="kpis">
        <div class="kpi"><span class="label">Active entities</span><b>{{ data.entities.byStatus.active ?? 0 }}</b><span class="sub">{{ data.entities.byStatus.forming ?? 0 }} forming · {{ (data.entities.byStatus.dormant ?? 0) + (data.entities.byStatus.closed ?? 0) }} dormant or closed</span></div>
        <div class="kpi"><span class="label">Group companies</span><b>{{ data.groupCompanies.count }}</b><span class="sub">{{ data.groupCompanies.subsidiaries }} subsidiaries · {{ data.groupCompanies.affiliates }} affiliates</span></div>
        <div class="kpi"><span class="label">Group company revenue</span><b>{{ usd(data.groupCompanies.revenue) }}</b><span class="sub">latest month, combined</span></div>
        <div class="kpi"><span class="label">Group company cash</span><b>{{ usd(data.groupCompanies.cash) }}</b><span class="sub">latest reported, combined</span></div>
      </div>
      <div class="charts">
        <TrendChart title="Group company revenue" sub="Combined, per month" unit="usd" :points="pts(data.groupCompanies.revenueSeries, true)" foot="Subsidiaries and affiliates, as reported" />
      </div>
      <div class="three">
        <div class="card"><DonutChart title="Entities by type" total-label="Entities" :segments="kinds.map(([k, c]) => ({ label: KIND[k] ?? k, value: c }))" /></div>
        <div class="card"><DonutChart title="Documents by entity" total-label="Documents" :segments="data.documents.byEntity.map((d: any) => ({ label: d.name, value: d.c }))" /></div>
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

<style>.ovtab .head > h1, .ovtab section > p.label:first-child { display: none; } .ovtab .head { justify-content: flex-end; } .ovtab .kpis { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)) !important; gap: 12px; } .ovtab .charts { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important; gap: 12px; } .ovtab .three, .ovtab .two { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important; gap: 12px; } .ovtab .kpi { min-width: 0; } .ovtab .kpi b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }</style>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; gap: 12px; flex-wrap: wrap; }
.filters { display: flex; gap: 10px; } .filters select { font: inherit; font-size: 13px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-weight: 500; letter-spacing: -0.02em; font-size: 30px; color: var(--c-navy); line-height: 1.1; }
.sub { font-size: 12px; color: var(--c-muted); }
.charts, .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
h3 { font-family: var(--font-heading); font-size: 20px; font-weight: 500; color: var(--c-navy); margin: 0 0 12px; }
.bar { display: grid; grid-template-columns: 120px 1fr 28px; gap: 10px; align-items: center; padding: 5px 0; font-size: 13px; }
.bar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar i { display: block; height: 10px; background: var(--c-blue); min-width: 2px; } .bar b { text-align: right; font-weight: 500; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; } th { text-align: left; font-size: var(--type-label); letter-spacing: 0; color: var(--c-muted); font-weight: 500; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); }
td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); } .cap { text-transform: capitalize; } .red { color: var(--c-danger); font-weight: 500; }
.muted { color: var(--c-muted); }
.sec { font-size: 13px; letter-spacing: 0; font-family: var(--font-body); color: var(--c-muted); font-weight: 500; margin: 8px 0 12px; }
.cashent { grid-column: span 2; } .ce { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); } .ce b { font-weight: 500; color: var(--c-navy); text-align: right; }
.stale { list-style: none; padding: 0; margin: 0; } .stale li { padding: 8px 0; border-bottom: 1px solid var(--c-rule); } .stale span { display: block; font-size: 12px; color: var(--c-warn); }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } .charts, .three { grid-template-columns: 1fr; } .cashent { grid-column: auto; } }
</style>
