<script setup lang="ts">
// A shared financial board (read-only).
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
// The viewer's own choice of company (group or one company) and period; the board's settings are the start.
const subject = ref(''), period = ref('')
// Fetched together, not one after another (each wait is a round trip to the server).
const [__p127_0, __p127_1] = await Promise.all([
  useFetch<{ forecast: { name: string; assumptions: import('~/shared/forecast').Assumptions } | null; name: string; note: string | null; data: { labels: string[]; series: Record<string, (number | null)[]>; kpis: { key: string; label: string; unit: string; value: number | null; prev: number | null; change: number | null }[]; charts: { title: string; metrics: string[] }[]; currency: string; period: string }; workspace: { firm: string }; period: string; entities: { id: string; name: string }[]; subject: string | null }>('/api/public/board/' + token, { key: 'pub-board-' + token, query: { subject, period }, watch: [subject, period] }),
  useFetch<{ metrics: Record<string, { label: string; unit: string }> }>('/api/public/board-metrics', { key: 'board-metrics' })])
const { data, error } = __p127_0
const { data: m } = __p127_1
useHead({ title: () => (data.value ? data.value.workspace.firm + ' · ' + data.value.name : 'Financial board'), meta: [{ name: 'robots', content: 'noindex' }] })
</script>
<template>
  <section class="wrap pb">
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1><p class="muted">Ask the company for a new link.</p></div>
    <template v-else-if="data"><p class="label">{{ data.workspace.firm }} · financial board</p><h1>{{ data.name }}</h1><p v-if="data.note" class="muted">{{ data.note }}</p>
      <div class="ctl"><label v-if="data.entities?.length" class="ent"><span class="sr">Company</span><select :value="data.subject ?? ''" @change="subject = ($event.target as HTMLSelectElement).value"><option v-for="e in data.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
        <span class="seg" role="group" aria-label="Period"><button v-for="[p, l] in [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']]" :key="p" type="button" :class="{ on: (data.period ?? 'month') === p }" @click="period = p!">{{ l }}</button></span></div>
      <BoardView :data="data.data" :metrics="m?.metrics ?? {}" viewer /><div v-if="data.forecast" class="bf"><h2>Forecast · {{ data.forecast.name }}</h2><ForecastSummary :assumptions="data.forecast.assumptions" compact /></div><p class="foot muted">Figures as reported by {{ data.workspace.firm }}. Updated as new figures are added.</p></template>
  </section>
</template>
<style scoped>
.pb { max-width: 1160px; margin: 0 auto; padding: 32px 20px 60px; } .pb h1 { margin: 2px 0 6px; } .bf { margin-top: 24px; display: flex; flex-direction: column; gap: 12px; } .bf h2 { margin: 0; font-size: 18px; } .muted { color: var(--c-muted); }
.ctl { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 14px 0 16px; } .ent select { font: inherit; font-size: 14px; padding: 8px 32px 8px 12px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 220px; } .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.seg { display: inline-flex; border: 1px solid var(--c-rule-strong); } .seg button { font: inherit; font-size: 13.5px; border: 0; background: #fff; padding: 8px 14px; cursor: pointer; } .seg button.on { background: var(--c-navy); color: #fff; } .foot { font-size: 12.5px; margin-top: 18px; }
</style>
