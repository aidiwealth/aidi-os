<script setup lang="ts">
// A shared financial board (read-only).
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
const { data, error } = await useFetch<{ name: string; note: string | null; data: { labels: string[]; series: Record<string, (number | null)[]>; kpis: { key: string; label: string; unit: string; value: number | null; prev: number | null; change: number | null }[]; charts: { title: string; metrics: string[] }[]; currency: string; period: string }; workspace: { firm: string } }>('/api/public/board/' + token, { key: 'pub-board-' + token })
const { data: m } = await useFetch<{ metrics: Record<string, { label: string; unit: string }> }>('/api/public/board-metrics', { key: 'board-metrics' })
useHead({ title: () => (data.value ? data.value.workspace.firm + ' · ' + data.value.name : 'Financial board'), meta: [{ name: 'robots', content: 'noindex' }] })
</script>
<template>
  <section class="wrap pb">
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1><p class="muted">Ask the company for a new link.</p></div>
    <template v-else-if="data"><p class="label">{{ data.workspace.firm }} · financial board</p><h1>{{ data.name }}</h1><p v-if="data.note" class="muted">{{ data.note }}</p>
      <BoardView :data="data.data" :metrics="m?.metrics ?? {}" /><p class="foot muted">Figures as reported by {{ data.workspace.firm }}. Updated as new figures are added.</p></template>
  </section>
</template>
<style scoped>
.pb { max-width: 1160px; margin: 0 auto; padding: 32px 20px 60px; } .pb h1 { margin: 2px 0 6px; } .muted { color: var(--c-muted); } .foot { font-size: 12.5px; margin-top: 18px; }
</style>
