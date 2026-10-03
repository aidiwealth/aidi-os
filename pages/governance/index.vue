<script setup lang="ts">
useHead({ title: 'Trusts & governance — Aidi OS' })
interface Ent { id: string; name: string; kind: string; status: string; parties: number; resolutions: number; open: number }
interface Await { id: string; title: string; kind: string; entity: string; circulated_at: string }
const { data, error } = await useFetch<{ entities: Ent[]; awaiting: Await[] }>('/api/governance')
const KIND: Record<string, string> = { holding: 'Holding', operating: 'Operating company', fund: 'Fund', gp: 'General partner', management_company: 'Management company', trust: 'Trust', household: 'Household', spv: 'SPV', other: 'Other' }
const RK: Record<string, string> = { resolution: 'Resolution', minutes: 'Minutes', distribution: 'Distribution', consent: 'Written consent' }
</script>

<template>
  <section>
    <p class="label">Family Office</p>
    <h1>Trusts &amp; governance</h1>
    <p class="lead">Who holds which role in each trust and company, and the resolutions, minutes and distributions that need their approval.</p>
    <p v-if="error" class="error" role="alert">{{ error.statusCode === 403 ? 'Trusts & governance is limited to family members and GPs.' : 'Could not load.' }}</p>
    <template v-else-if="data">
      <div v-if="data.awaiting.length" class="card await">
        <h2>Awaiting your signature</h2>
        <ul><li v-for="a in data.awaiting" :key="a.id"><NuxtLink :to="'/governance/resolutions/' + a.id">{{ a.title }}</NuxtLink><span>{{ RK[a.kind] }} · {{ a.entity }}</span></li></ul>
      </div>
      <table class="table">
        <thead><tr><th>Entity</th><th>Parties</th><th>Resolutions</th><th>Open</th></tr></thead>
        <tbody><tr v-for="e in data.entities" :key="e.id">
          <td><NuxtLink :to="'/governance/' + e.id" class="co">{{ e.name }}</NuxtLink><span class="sub">{{ KIND[e.kind] ?? e.kind }} · {{ e.status }}</span></td>
          <td>{{ e.parties || '—' }}</td><td>{{ e.resolutions || '—' }}</td><td :class="{ hl: e.open }">{{ e.open || '—' }}</td>
        </tr></tbody>
      </table>
    </template>
  </section>
</template>

<style scoped>
.lead { color: var(--c-muted); margin: 8px 0 20px; max-width: 75ch; }
.await { border-left: 4px solid var(--c-blue); margin-bottom: 20px; } .await h2 { margin-bottom: 8px; }
.await ul { list-style: none; padding: 0; margin: 0; } .await li { padding: 8px 0; border-bottom: 1px solid var(--c-rule); } .await li span { display: block; font-size: 12px; color: var(--c-muted); }
.table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--c-rule); }
th { text-align: left; font-size: var(--type-label); letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 12px 16px; border-bottom: 1px solid var(--c-rule); } .hl { color: var(--c-blue-deep); font-weight: 600; }
.co { color: var(--c-navy); font-weight: 500; text-decoration: none; } .sub { display: block; font-size: 12px; color: var(--c-muted); text-transform: capitalize; }
.error { color: var(--c-danger); }
</style>
