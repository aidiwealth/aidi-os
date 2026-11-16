<script setup lang="ts">
import { shortAmount } from '~/shared/compact'
useHead({ title: 'Finvry · Overview' })
interface O { kpis: { total: number; active: number; trial: number; past_due: number; suspended: number; new30: number; seats: number; mrr: number; arr: number; newMrr: number; churnMrr: number; pipelineOpen: number; pipeline: number; weighted: number; overdueCount: number; overdue: number }
  mrrSeries: { period: string; value: number }[]; renewals: { id: string; customer: string; organization_id: string; renews: string; amount_usd: string; billing: string }[]
  requests: { pending: number; week: number; items: Req[] }
  byPlan: { plan: string; n: number }[]; trials: { id: string; name: string; ends: string | null }[]; recent: { id: string; name: string; status: string; plan: string }[] }
interface Req { id: string; name: string; email: string; company: string; website: string | null; country: string; stage: string; team_size: string; needs: string[]; needs_note: string | null; source: string | null; community: string | null; want_demo: boolean; flags: string[]; status: string; created: string }
// New access requests: who asked, for which company, and what they want Finvry for; decisions are made on the Access page.
const STAGE: Record<string, string> = { idea: 'Idea', pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A+', established: 'Established' }
const NEED: Record<string, string> = { reporting: 'Reporting', investors: 'Investor relations', fundraising: 'Fundraising', cap_table: 'Cap table', forecast: 'Forecasts', customers: 'Customers', group: 'Group', compliance: 'Compliance', services: 'Services' }
const FLAG: Record<string, string> = { regulated: 'Regulated activity?', personal_email: 'Personal email', idea_stage: 'No company yet' }
const ago = (s: string) => { const n = Date.now() - new Date(s).getTime(); return n < 36e5 ? Math.max(1, Math.round(n / 6e4)) + ' min ago' : n < 864e5 ? Math.round(n / 36e5) + ' h ago' : n < 7 * 864e5 ? Math.round(n / 864e5) + ' d ago' : new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
const site = (w: string | null) => (w ? w.replace(/^https?:\/\//, '').replace(/\/$/, '') : '')
const { data } = await useFetch<O>('/api/platform/overview')
const usd = (v: number | string) => shortAmount(v)
const pts = (s?: { period: string; value: number }[]) => (s ?? []).map((x) => ({ label: new Date(x.period + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: x.value }))
const max = computed(() => Math.max(1, ...(data.value?.byPlan ?? []).map((p) => p.n)))
const day = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
</script>

<template>
  <section v-if="data">
    <p class="label">Finvry platform</p>
    <div class="head"><h1>Overview</h1><div class="tools"><NuxtLink to="/platform/pipeline?new=1" class="btn secondary">New lead</NuxtLink><NuxtLink to="/platform/customers?new=1" class="btn">New customer</NuxtLink></div></div>
    <div class="fx-stats">
      <StatTile label="MRR" :value="usd(data.kpis.mrr)" :note="'ARR ' + usd(data.kpis.arr)" icon="money" tone="n" />
      <StatTile label="This month" :value="'+' + usd(data.kpis.newMrr)" pos :note="'−' + usd(data.kpis.churnMrr) + ' churned'" :note-tone="data.kpis.churnMrr ? 'red' : ''" icon="chart" tone="g" />
      <StatTile label="Customers" :value="data.kpis.active" :note="data.kpis.trial + ' on trial · ' + data.kpis.past_due + ' past due'" icon="users" tone="b" />
      <StatTile label="Pipeline" :value="usd(data.kpis.weighted)" :note="'weighted MRR · ' + data.kpis.pipelineOpen + ' open deals (' + usd(data.kpis.pipeline) + ')'" icon="briefcase" tone="c" />
    </div>
    <div v-if="data.requests" class="card rq">
      <div class="rqh"><h3>New access requests <span class="n">{{ data.requests.pending }} waiting · {{ data.requests.week }} this week</span></h3><NuxtLink to="/platform/access" class="btn secondary">Review requests</NuxtLink></div>
      <div v-if="data.requests.items.length" class="tw"><table class="rqt">
        <thead><tr><th>Person</th><th>Company</th><th>Stage · team</th><th>Wants help with</th><th>Heard via</th><th>Received</th></tr></thead>
        <tbody><tr v-for="r in data.requests.items" :key="r.id">
          <td><b>{{ r.name }}</b><a :href="'mailto:' + r.email">{{ r.email }}</a></td>
          <td><b>{{ r.company }}</b><span>{{ r.country }}<template v-if="r.website"> · <a :href="/^https?:/.test(r.website) ? r.website : 'https://' + r.website" target="_blank" rel="noopener">{{ site(r.website) }}</a></template></span></td>
          <td>{{ STAGE[r.stage] ?? r.stage }}<span>{{ r.team_size }} {{ r.team_size === '1' ? 'person' : 'people' }}</span></td>
          <td><span class="tags"><i v-for="n in r.needs" :key="n">{{ NEED[n] ?? n }}</i></span><span v-if="r.needs_note" class="note">“{{ r.needs_note }}”</span></td>
          <td>{{ r.source ?? '—' }}<span v-if="r.community">{{ r.community }}</span></td>
          <td>{{ ago(r.created) }}<span v-if="r.want_demo || r.status === 'demo'" class="demo">Wants a demo</span><span v-for="f in r.flags" :key="f" class="flag">{{ FLAG[f] ?? f }}</span></td>
        </tr></tbody></table></div>
      <EmptyState v-else compact icon="customers" title="No requests waiting" />
    </div>
    <div class="charts">
      <TrendChart title="Monthly recurring revenue" sub="Last 12 months" unit="usd" :points="pts(data.mrrSeries)" :foot="data.kpis.seats + ' seats in use'" />
      <div class="card"><DonutChart title="Customers by plan" total-label="Customers" :segments="data.byPlan.map((p) => ({ label: p.plan, value: p.n }))" />
        <p v-if="data.kpis.overdueCount" class="warn"><NuxtLink to="/platform/billing">{{ data.kpis.overdueCount }} overdue invoice{{ data.kpis.overdueCount === 1 ? '' : 's' }} · {{ usd(data.kpis.overdue) }}</NuxtLink></p></div>
    </div>
    <div class="three">
      <div class="card"><h3>Renewals in 30 days</h3>
        <ul v-if="data.renewals.length" class="list"><li v-for="r in data.renewals" :key="r.id"><NuxtLink :to="'/platform/customers/' + r.organization_id">{{ r.customer }}</NuxtLink><span class="nc">{{ day(r.renews) }} · {{ usd(r.amount_usd) }} / {{ r.billing === 'annual' ? 'year' : 'month' }}</span></li></ul>
        <EmptyState v-else compact icon="customers" title="None due" /></div>
      <div class="card"><h3>Trials</h3>
        <ul v-if="data.trials.length" class="list"><li v-for="t in data.trials" :key="t.id"><NuxtLink :to="'/platform/customers/' + t.id">{{ t.name }}</NuxtLink><span>ends {{ day(t.ends) }}</span></li></ul>
        <p v-else class="muted">No trials running.</p></div>
      <div class="card"><h3>Newest customers</h3>
        <ul v-if="data.recent.length" class="list"><li v-for="r in data.recent" :key="r.id"><NuxtLink :to="'/platform/customers/' + r.id">{{ r.name }}</NuxtLink><span>{{ r.plan }} · {{ r.status }}</span></li></ul>
        <EmptyState v-else compact icon="customers" title="No customers yet" /></div>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; } .tools { display: flex; gap: 10px; } .tools .btn { text-decoration: none; }
.charts { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 16px; } .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
h3 { font-family: var(--font-heading); font-size: 20px; font-weight: 500; color: var(--c-navy); margin: 0 0 12px; }
.bar { display: grid; grid-template-columns: 110px 1fr 28px; gap: 10px; align-items: center; padding: 5px 0; font-size: 13px; }
.bar i { display: block; height: 10px; background: var(--c-blue); min-width: 2px; } .bar b { text-align: right; font-weight: 500; }
.warn { margin: 14px 0 0; font-size: 13px; } .warn a { color: var(--c-danger); }
.list { list-style: none; padding: 0; margin: 0; } .list li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .list span { color: var(--c-muted); font-size: 12.5px; text-transform: capitalize; white-space: nowrap; } .list span.nc { text-transform: none; }
.muted { color: var(--c-muted); }
.rq { margin-bottom: 16px; } .rqh { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 6px; } .rqh h3 { margin: 0; } .rqh .n { font-family: var(--font-body); font-size: 13px; color: var(--c-muted); margin-left: 8px; font-weight: 400; } .rqh .btn { text-decoration: none; }
.tw { overflow-x: auto; } .rqt { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 860px; }
.rqt th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 10px 12px 8px 0; border-bottom: 1px solid var(--c-rule); }
.rqt td { padding: 12px 12px 12px 0; border-bottom: 1px solid var(--c-rule); vertical-align: top; color: var(--c-ink); } .rqt tr:last-child td { border-bottom: 0; }
.rqt td b { display: block; font-weight: 600; color: var(--c-navy); } .rqt td > span, .rqt td > a { display: block; font-size: 12.5px; color: var(--c-muted); margin-top: 2px; } .rqt a { color: var(--c-blue); text-decoration: none; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; } .tags i { font-style: normal; font-size: 12px; background: var(--c-paper-2); border: 1px solid var(--c-rule); padding: 2px 7px; color: var(--c-ink); } .rqt .note { max-width: 260px; }
.rqt .demo { color: var(--c-navy) !important; font-weight: 600; } .rqt .flag { color: var(--c-danger) !important; }
@media (max-width: 1100px) { .charts, .three { grid-template-columns: 1fr; } }
</style>
