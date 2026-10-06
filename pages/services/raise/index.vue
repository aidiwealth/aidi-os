<script setup lang="ts">
useHead({ title: 'Fundraising clients' })
interface R { id: string; client: string; status: string; round: string | null; currency: string; totals: { target: number; committed: number; closed: number; fee: number; count: number; active: number }; next: { title: string; starts_at: string } | null }
const { data } = await useFetch<R[]>('/api/services/raise')
const money = (v: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0, notation: v >= 1e6 ? 'compact' : 'standard' }).format(v)
</script>
<template>
  <section>
    <p class="label">Services desk</p><h1>Fundraising clients</h1>
    <p class="lead">Companies we raise for (switched on per customer in the console). Success fees are on money closed.</p>
    <div v-if="data?.length" class="card"><table class="mini"><thead><tr><th>Client</th><th>Status</th><th class="n">Target</th><th class="n">Committed</th><th class="n">Closed</th><th class="n">Fee</th><th>Investors</th><th>Next meeting</th></tr></thead><tbody>
      <tr v-for="r in data" :key="r.id"><td><NuxtLink :to="'/services/raise/' + r.id"><b>{{ r.client }}</b></NuxtLink><span class="s">{{ r.round }}</span></td><td>{{ r.status }}</td><td class="n">{{ money(r.totals.target, r.currency) }}</td><td class="n">{{ money(r.totals.committed, r.currency) }}</td><td class="n">{{ money(r.totals.closed, r.currency) }}</td><td class="n">{{ money(r.totals.fee, r.currency) }}</td><td>{{ r.totals.active }} active / {{ r.totals.count }}</td><td>{{ r.next ? new Date(r.next.starts_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' · ' + r.next.title : '—' }}</td></tr></tbody></table></div>
    <EmptyState v-else card icon="fundraising" title="No fundraising clients yet" text="Switch on Managed fundraising for a customer in Console → Customers. Their brief creates a job here." />
  </section>
</template>
<style scoped>
.lead { color: var(--c-muted); } .s { display: block; font-size: 12px; color: var(--c-muted); } .n { text-align: right; white-space: nowrap; } a { text-decoration: none; color: inherit; }
</style>
