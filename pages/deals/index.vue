<script setup lang="ts">
import type { DealRow } from '~/server/api/deals/index.get'
useHead({ title: 'Deals' })
const { data, error } = await useFetch<DealRow[]>('/api/deals')
const filter = ref<'open' | 'all'>('open')
const rows = computed(() => (data.value ?? []).filter((r) => filter.value === 'all' || ['new', 'screened', 'on_hold', 'advancing'].includes(r.status)))
const REC: Record<string, string> = { prioritise: 'Prioritise', review: 'Review', likely_pass: 'Likely pass' }
const STATUS: Record<string, string> = { new: 'New', screened: 'Screened', advancing: 'Advancing', on_hold: 'On hold', declined: 'Declined' }
const STAGE: Record<string, string> = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', later: 'Later' }
const date = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
</script>

<template>
  <section>
    <p class="label">Venture Capital</p>
    <div class="head">
      <h1>Deals</h1>
      <div class="tabs" role="tablist">
        <button :class="{ on: filter === 'open' }" @click="filter = 'open'">Open</button>
        <button :class="{ on: filter === 'all' }" @click="filter = 'all'">All</button>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">Could not load deals: {{ error.message }}</p>
    <p v-else-if="!rows.length" class="empty">No pitches yet. They arrive here from your public pitch form (see Settings).</p>
    <table v-else class="table">
      <thead><tr><th>Received</th><th>Company</th><th>Stage</th><th>AI screening</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td class="muted">{{ date(r.received_at) }}</td>
          <td><NuxtLink :to="'/deals/' + r.id" class="co">{{ r.company }}</NuxtLink><span class="one">{{ r.one_liner }}</span></td>
          <td>{{ STAGE[r.stage] ?? r.stage }}<span v-if="r.country" class="one">{{ r.country }}</span></td>
          <td><span v-if="r.score !== null" class="score" :data-rec="r.recommendation">{{ r.score }} · {{ REC[r.recommendation ?? ''] }}</span><span v-else class="muted">Not screened</span></td>
          <td>{{ STATUS[r.status] ?? r.status }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin: 4px 0 24px; }
.tabs button { font: inherit; background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 2px; margin-left: 16px; cursor: pointer; color: var(--c-muted); }
.tabs button.on { color: var(--c-navy); border-bottom-color: var(--c-navy); }
.table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--c-rule); }
th { text-align: left; font-size: var(--type-label); letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 14px 16px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
.co { color: var(--c-navy); font-weight: 500; text-decoration: none; }
.one { display: block; color: var(--c-muted); font-size: 13px; margin-top: 2px; }
.muted { color: var(--c-muted); }
.score { font-weight: 500; }
.score[data-rec="prioritise"] { color: var(--c-ok); }
.score[data-rec="likely_pass"] { color: var(--c-muted); }
.empty { color: var(--c-muted); }
.error { color: var(--c-danger); }
</style>
