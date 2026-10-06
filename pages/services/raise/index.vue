<script setup lang="ts">
// Desk: every company we raise for, with progress and what's next.
useHead({ title: 'Fundraising clients' })
interface R { id: string; client: string; status: string; round: string | null; currency: string; totals: { target: number; committed: number; closed: number; pipeline: number; fee: number; count: number; active: number }; next: { title: string; starts_at: string } | null }
const { data } = await useFetch<R[]>('/api/services/raise')
const filter = ref('all')
const list = computed(() => (data.value ?? []).filter((r) => filter.value === 'all' || r.status === filter.value))
const money = (v: number, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: v >= 1e6 ? 1 : 0, notation: v >= 1e6 ? 'compact' : 'standard' }).format(v)
const sum = (k: 'target' | 'committed' | 'closed' | 'fee') => (data.value ?? []).filter((r) => r.currency === 'USD').reduce((a, r) => a + r.totals[k], 0)
const ST: Record<string, string> = { intake: 'Getting started', active: 'In progress', paused: 'Paused', closed: 'Closed' }
const pct = (r: R) => (r.totals.target ? Math.min(100, Math.round((r.totals.committed / r.totals.target) * 100)) : 0)
const upcoming = computed(() => (data.value ?? []).filter((r) => r.next).length)
const when = (s: string) => new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>
<template>
  <section>
    <p class="label">Services desk</p>
    <div class="hd"><div><h1>Fundraising clients</h1><p class="lead">Companies we raise for. Switch the service on per customer in Console → Customers; the founder's brief lands here.</p></div></div>
    <div v-if="data?.length" class="kp"><div class="k"><span>Active raises</span><b>{{ data.filter((r) => r.status === 'active').length }}</b><em>{{ data.length }} in total</em></div><div class="k"><span>Total target</span><b>{{ money(sum('target')) }}</b><em>USD raises</em></div><div class="k"><span>Committed</span><b>{{ money(sum('committed')) }}</b></div><div class="k"><span>Closed</span><b>{{ money(sum('closed')) }}</b></div><div class="k"><span>Fees earned</span><b>{{ money(sum('fee')) }}</b><em>on money closed</em></div><div class="k"><span>Upcoming meetings</span><b>{{ upcoming }}</b></div></div>
    <div v-if="data?.length" class="chips"><button v-for="[k, l] in [['all', 'All'], ['active', 'In progress'], ['intake', 'Getting started'], ['paused', 'Paused'], ['closed', 'Closed']]" :key="k" :class="{ on: filter === k }" @click="filter = k">{{ l }}</button></div>
    <div v-if="list.length" class="grid">
      <NuxtLink v-for="r in list" :key="r.id" :to="'/services/raise/' + r.id" class="rc">
        <div class="top"><div><b>{{ r.client }}</b><span class="sub">{{ r.round || 'Round not set' }} · {{ r.currency }}</span></div><span class="pill" :class="r.status">{{ ST[r.status] ?? r.status }}</span></div>
        <div class="prog"><div class="pl"><span>{{ money(r.totals.committed, r.currency) }} committed</span><span>of {{ money(r.totals.target, r.currency) }}</span></div><div class="bar"><i :style="{ width: pct(r) + '%' }" /></div></div>
        <div class="nums"><div><span>Pipeline</span><b>{{ money(r.totals.pipeline, r.currency) }}</b></div><div><span>Closed</span><b>{{ money(r.totals.closed, r.currency) }}</b></div><div><span>Fee</span><b>{{ money(r.totals.fee, r.currency) }}</b></div><div><span>Investors</span><b>{{ r.totals.active }}<small> / {{ r.totals.count }}</small></b></div></div>
        <div class="nx" :class="{ none: !r.next }">{{ r.next ? '📅 ' + when(r.next.starts_at) + ' · ' + r.next.title : r.totals.count ? 'No meeting booked' : 'Start the investor list →' }}</div>
      </NuxtLink>
    </div>
    <EmptyState v-else-if="!data?.length" card icon="fundraising" title="No fundraising clients yet" text="Switch on Managed fundraising for a customer in Console → Customers. Their brief creates a job and appears here." />
    <p v-else class="lead">No raises with this status.</p>
  </section>
</template>
<style scoped>
.hd h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; }
.kp { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 16px 0; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; } .k span { font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 22px; font-weight: 600; } .k em { font-style: normal; font-size: 11.5px; color: var(--c-muted); }
.chips { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; } .rc { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 14px; transition: border-color .12s, box-shadow .12s; } .rc:hover { border-color: var(--c-navy); box-shadow: 0 8px 24px rgba(12,26,46,.08); }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; } .top b { font-size: 16.5px; display: block; } .sub { font-size: 12.5px; color: var(--c-muted); }
.pill { font-size: 11.5px; padding: 3px 9px; white-space: nowrap; background: var(--c-paper-2); color: var(--c-ink-soft); } .pill.active { background: rgba(31,122,77,.1); color: var(--c-ok); } .pill.intake { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pill.paused { background: rgba(181,71,8,.09); color: var(--c-warn); }
.pl { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 6px; } .pl span:first-child { font-weight: 600; } .pl span:last-child { color: var(--c-muted); } .bar { height: 8px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-ok); }
.nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .nums span { display: block; font-size: 11.5px; color: var(--c-muted); } .nums b { font-size: 14.5px; font-weight: 600; } .nums small { font-weight: 400; color: var(--c-muted); }
.nx { font-size: 13px; background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 8px 10px; } .nx.none { background: var(--c-paper-2); color: var(--c-muted); }
</style>
