<script setup lang="ts">
// A shared financial board (read-only).
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
// Fetched together, not one after another (each wait is a round trip to the server).
const [__p127_0, __p127_1] = await Promise.all([
  useFetch<{ forecast: { name: string; assumptions: import('~/shared/forecast').Assumptions } | null; name: string; note: string | null; data: { labels: string[]; series: Record<string, (number | null)[]>; kpis: { key: string; label: string; unit: string; value: number | null; prev: number | null; change: number | null }[]; charts: { title: string; metrics: string[] }[]; currency: string; period: string }; workspace: { firm: string } }>('/api/public/board/' + token, { key: 'pub-board-' + token }),
  useFetch<{ metrics: Record<string, { label: string; unit: string }> }>('/api/public/board-metrics', { key: 'board-metrics' })])
const { data, error } = __p127_0
const { data: m } = __p127_1
useHead({ title: () => (data.value ? data.value.workspace.firm + ' · ' + data.value.name : 'Financial board'), meta: [{ name: 'robots', content: 'noindex' }] })
</script>
<template>
  <section class="wrap pb">
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1><p class="muted">Ask the company for a new link.</p></div>
    <template v-else-if="data"><p class="label">{{ data.workspace.firm }} · financial board</p><h1>{{ data.name }}</h1><p v-if="data.note" class="muted">{{ data.note }}</p>
      <BoardView :data="data.data" :metrics="m?.metrics ?? {}" /><div v-if="data.forecast" class="bf"><h2>Forecast · {{ data.forecast.name }}</h2><ForecastSummary :assumptions="data.forecast.assumptions" compact /></div><p class="foot muted">Figures as reported by {{ data.workspace.firm }}. Updated as new figures are added.</p></template>
  </section>
</template>
<style scoped>
.pb { max-width: 1160px; margin: 0 auto; padding: 32px 20px 60px; } .pb h1 { margin: 2px 0 6px; } .bf { margin-top: 24px; display: flex; flex-direction: column; gap: 12px; } .bf h2 { margin: 0; font-size: 18px; } .muted { color: var(--c-muted); } .foot { font-size: 12.5px; margin-top: 18px; }
</style>
