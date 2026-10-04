<script setup lang="ts">
// A shared financials page: the metrics the sender chose, latest values and trends. Read-only.
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
interface D { title: string; subject: string; currency: string; period_type: string; series: { key: string; points: { period: string; value: number | null }[] }[]; lines: { key: string; label: string }[]; derived: { key: string; label: string }[]; workspace: { firm: string } }
const { data, error } = await useFetch<D>('/api/public/share/' + token, { key: 'pub-share-' + token })
useHead({ titleTemplate: '%s', title: () => data.value?.title ?? 'Shared financials', meta: [{ name: 'robots', content: 'noindex' }] })
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const label = (k: string) => k.startsWith('kpi:') ? k.slice(4) : ([...(data.value?.lines ?? []), ...(data.value?.derived ?? [])].find((x) => x.key === k)?.label ?? k)
const isMoney = (k: string) => !k.startsWith('kpi:') && !['gross_margin', 'runway'].includes(k)
const lbl = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', data.value?.period_type === 'year' ? { year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
const last = (s: D['series'][number]) => [...s.points].reverse().find((p) => p.value !== null)
const fmt = (k: string, v: number | null | undefined) => v == null ? '—' : k === 'gross_margin' ? v + '%' : k === 'runway' ? v + ' months' : isMoney(k) ? (SYM[data.value!.currency] ?? data.value!.currency + ' ') + Math.round(v).toLocaleString('en-US') : v.toLocaleString('en-US')
</script>
<template>
  <section class="wrap">
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1></div>
    <template v-else-if="data">
      <p class="label">{{ data.subject }}</p><h1>{{ data.title }}</h1>
      <div class="cards"><div v-for="s in data.series" :key="s.key" class="card k"><span class="l">{{ label(s.key) }}</span><b>{{ fmt(s.key, last(s)?.value) }}</b><span class="s">{{ last(s) ? lbl(last(s)!.period) : 'No data' }}</span></div></div>
      <div class="charts"><TrendChart v-for="s in data.series.filter((x) => x.points.some((p) => p.value !== null)).slice(0, 6)" :key="s.key" :title="label(s.key)" :unit="isMoney(s.key) ? 'usd' : 'count'" :symbol="SYM[data.currency] ?? data.currency + ' '"
        :points="s.points.filter((p) => p.value !== null).map((p) => ({ label: lbl(p.period), value: p.value as number }))" :foot="data.period_type === 'month' ? 'Monthly' : data.period_type === 'quarter' ? 'Quarterly' : 'Yearly'" /></div>
      <p class="fine">Unaudited figures shared by {{ data.workspace.firm }} for information only.</p>
    </template>
  </section>
</template>
<style scoped>
.wrap { max-width: 1000px; margin: 0 auto; } h1 { margin: 0 0 16px; } .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 14px; }
.k { display: flex; flex-direction: column; gap: 6px; } .l { font-size: 13px; color: var(--c-muted); } .k b { font-size: 26px; font-weight: 600; } .s { font-size: 12.5px; color: var(--c-muted); }
.charts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; } .fine { font-size: 12px; color: var(--c-muted); margin-top: 18px; }
@media (max-width: 760px) { .charts { grid-template-columns: 1fr; } }
</style>
