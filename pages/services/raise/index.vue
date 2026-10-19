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
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
const share = (r: R, v: number) => (r.totals.target ? Math.min(100, (v / r.totals.target) * 100) : 0)
const when = (s: string) => new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>
<template>
  <section>
    <div class="hd"><div><p class="eyebrow">Services desk</p><h1>Fundraising clients</h1><p class="lead">Companies we raise for. Switch the service on per customer in Console → Customers; the founder's brief lands here.</p></div></div>
    <div v-if="data?.length" class="fx-stats">
      <StatTile icon="flag" tone="b" label="Active raises" :value="data.filter((r) => r.status === 'active').length" :note="data.length + ' in total'" />
      <StatTile icon="chart" tone="n" label="Total target (USD)" :value="money(sum('target'))" />
      <StatTile icon="money" tone="c" label="Committed" :value="money(sum('committed'))" />
      <StatTile icon="check" tone="g" label="Closed" :value="money(sum('closed'))" />
      <StatTile icon="billing" tone="a" label="Fees earned" :value="money(sum('fee'))" note="on money closed" />
      <StatTile icon="calendar" tone="b" label="Upcoming meetings" :value="upcoming" />
    </div>
    <div v-if="data?.length" class="chips"><button v-for="[k, l] in [['all', 'All'], ['active', 'In progress'], ['intake', 'Getting started'], ['paused', 'Paused'], ['closed', 'Closed']]" :key="k" :class="{ on: filter === k }" @click="filter = k">{{ l }}</button></div>
    <div v-if="list.length" class="grid">
      <NuxtLink v-for="r in list" :key="r.id" :to="'/services/raise/' + r.id" class="rc">
        <div class="top"><span class="fx-mono">{{ initials(r.client) }}</span><div class="tn"><b>{{ r.client }}</b><span class="sub">{{ r.round || 'Round not set' }} · {{ r.currency }}</span></div><span class="fx-pill" :class="{ g: r.status === 'active', blue: r.status === 'intake', amber: r.status === 'paused' }">{{ ST[r.status] ?? r.status }}</span></div>
        <div class="prog"><div class="pl"><span><b>{{ pct(r) }}%</b> committed · {{ money(r.totals.committed, r.currency) }}</span><span>Target {{ money(r.totals.target, r.currency) }}</span></div>
          <div class="bar"><i class="c" :style="{ width: share(r, r.totals.closed) + '%' }" /><i class="m" :style="{ width: Math.max(0, share(r, r.totals.committed) - share(r, r.totals.closed)) + '%' }" /></div>
          <div class="lg"><span><i class="c" />Closed</span><span><i class="m" />Committed</span><span><i />To raise</span></div></div>
        <div class="nums"><div><span>Pipeline</span><b>{{ brief(money(r.totals.pipeline, r.currency)) }}</b></div><div><span>Closed</span><b>{{ brief(money(r.totals.closed, r.currency)) }}</b></div><div><span>Fee</span><b>{{ brief(money(r.totals.fee, r.currency)) }}</b></div><div><span>Investors</span><b>{{ r.totals.active }}<small> / {{ r.totals.count }}</small></b></div></div>
        <div class="nx" :class="{ none: !r.next }"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="5" width="17" height="15" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg><span>{{ r.next ? when(r.next.starts_at) + ' · ' + r.next.title : r.totals.count ? 'No meeting booked' : 'Start the investor list →' }}</span></div>
      </NuxtLink>
    </div>
    <EmptyState v-else-if="!data?.length" card icon="fundraising" title="No fundraising clients yet" text="Switch on Managed fundraising for a customer in Console → Customers. Their brief creates a job and appears here." />
    <p v-else class="lead">No raises with this status.</p>
  </section>
</template>
<style scoped>
.hd h1 { margin: 0; } .eyebrow { margin: 0 0 4px; font-size: 13px; color: var(--c-muted); } .lead { color: var(--c-muted); margin: 4px 0 0; }
.chips { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; } .rc { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 14px; transition: border-color .12s, box-shadow .12s; } .rc:hover { border-color: var(--c-navy); box-shadow: 0 8px 24px rgba(12,26,46,.08); }
.top { display: flex; align-items: center; gap: 12px; } .tn { flex: 1; min-width: 0; } .top b { font-size: 16.5px; display: block; } .mono { flex: none; width: 42px; height: 42px; background: var(--c-navy); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 14px; } .sub { font-size: 12.5px; color: var(--c-muted); }
.pill { font-size: 11.5px; padding: 3px 9px; white-space: nowrap; background: var(--c-paper-2); color: var(--c-ink-soft); } .pill.active { background: rgba(29,90,134,.1); color: var(--c-ok); } .pill.intake { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pill.paused { background: rgba(181,71,8,.09); color: var(--c-warn); }
.pl { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 6px; } .pl span:first-child { font-weight: 600; } .pl span:last-child { color: var(--c-muted); } .bar { height: 10px; background: var(--c-paper-2); display: flex; } .bar i { display: block; height: 100%; } .bar i.c, .lg i.c { background: var(--c-ok); } .bar i.m, .lg i.m { background: var(--c-blue-deep); } .lg { display: flex; gap: 14px; margin-top: 6px; font-size: 11.5px; color: var(--c-muted); } .lg span { display: flex; align-items: center; gap: 5px; } .lg i { width: 8px; height: 8px; background: var(--c-paper-2); border: 1px solid var(--c-rule-strong); display: inline-block; } .lg i.c, .lg i.m { border: 0; }
.nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .nums span { display: block; font-size: 11.5px; color: var(--c-muted); } .nums b { font-size: 14.5px; font-weight: 600; } .nums small { font-weight: 400; color: var(--c-muted); }
.nx { font-size: 13px; background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 9px 12px; display: flex; gap: 8px; align-items: center; } .nx svg { width: 16px; height: 16px; flex: none; } .nx.none { background: var(--c-paper-2); color: var(--c-muted); }
</style>
