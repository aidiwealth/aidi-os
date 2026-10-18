<script setup lang="ts">
// Four key points on revenue retention or on the customer base. Kept until the data changes; refresh on demand.
const props = defineProps<{ kind: 'retention' | 'customers'; stamp?: string }>()
interface A { headline: string; insights: { title: string; detail: string; tone: 'good' | 'watch' | 'risk' }[]; ai: boolean; as_of: string }
const refreshQ = ref<string | undefined>(undefined)
const { data, pending, refresh } = await useLazyFetch<A | null>('/api/financials/customers/analysis', { query: { kind: props.kind, refresh: refreshQ, s: computed(() => props.stamp) }, server: false })
async function again() { refreshQ.value = '1'; await refresh(); refreshQ.value = undefined }
const TONE: Record<string, string> = { good: 'Going well', watch: 'Watch', risk: 'Risk' }
const mon = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
</script>
<template>
  <section class="ca">
    <div class="cah"><span class="eyebrow">What it says · 4 key points</span><span class="meta">{{ data ? 'To ' + mon(data.as_of) + (data.ai ? '' : ' · worked out from your data') : '' }}<button v-if="data" class="lk" :disabled="pending" @click="again">{{ pending ? 'Reading…' : 'Refresh' }}</button></span></div>
    <p v-if="pending && !data" class="skel">Reading your customers…</p>
    <template v-else-if="data">
      <h2 class="hl">{{ data.headline }}</h2>
      <div class="ins"><article v-for="(i, n) in data.insights.slice(0, 4)" :key="n" :class="i.tone"><em>{{ TONE[i.tone] }}</em><b>{{ i.title }}</b><p>{{ i.detail }}</p></article></div>
    </template>
  </section>
</template>
<style scoped>
.ca { background: #fff; border: 1px solid var(--c-rule); padding: 20px 22px; margin: 0 0 12px; }
.cah { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .eyebrow { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--c-muted); } .meta { font-size: 12px; color: var(--c-muted); display: flex; gap: 12px; align-items: center; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; }
.hl { font-family: var(--font-heading); font-weight: 500; font-size: 21px; line-height: 1.3; color: var(--c-navy); margin: 10px 0 16px; max-width: 75ch; }
.ins { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; background: var(--c-rule); border: 1px solid var(--c-rule); }
.ins article { background: #fff; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; position: relative; } .ins article::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--c-navy); } .ins article.watch::before { background: #c98a1c; } .ins article.risk::before { background: var(--c-danger); }
.ins em { font-style: normal; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); } .ins b { font-size: 14.5px; font-weight: 600; color: var(--c-ink); } .ins p { margin: 0; font-size: 13px; color: var(--c-ink-soft); line-height: 1.5; }
.skel { color: var(--c-muted); font-size: 13.5px; margin: 10px 0 0; }
@media (max-width: 1100px) { .ins { grid-template-columns: repeat(2, minmax(0, 1fr)); } } @media (max-width: 640px) { .ins { grid-template-columns: 1fr; } }
</style>
