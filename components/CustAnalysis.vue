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
      <div class="ins"><article v-for="(i, n) in data.insights.slice(0, 4)" :key="n"><span class="tn" :class="i.tone"><i>{{ i.tone === 'good' ? '↑' : i.tone === 'risk' ? '✕' : '!' }}</i>{{ TONE[i.tone] }}</span><b>{{ i.title }}</b><p>{{ i.detail }}</p></article></div>
    </template>
  </section>
</template>
<style scoped>
.ca { background: #fff; border: 1px solid var(--c-rule); padding: 20px 22px; margin: 0 0 12px; }
.cah { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .eyebrow { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--c-muted); } .meta { font-size: 12px; color: var(--c-muted); display: flex; gap: 12px; align-items: center; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; }
.hl { font-family: var(--font-heading); font-weight: 500; font-size: 21px; line-height: 1.3; color: var(--c-navy); margin: 10px 0 16px; max-width: 75ch; }
.ins { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.ins article { background: var(--c-paper-3); border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.ins b { font-size: 14px; font-weight: 500; color: var(--c-ink); line-height: 1.35; } .ins p { margin: 0; font-size: 12.5px; color: var(--c-ink-soft); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.tn { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; padding: 3px 8px 3px 4px; align-self: flex-start; } .tn i { font-style: normal; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff; }
.tn.risk { background: #fdecea; color: #8f1d14; } .tn.risk i { background: var(--c-danger); } .tn.watch { background: #fff3dc; color: #7a4f06; } .tn.watch i { background: #b8790f; } .tn.good { background: var(--c-signal-soft); color: var(--c-navy); } .tn.good i { background: var(--c-blue-deep); }
.skel { color: var(--c-muted); font-size: 13.5px; margin: 10px 0 0; }
@media (max-width: 1100px) { .ins { grid-template-columns: 1fr 1fr; } } @media (max-width: 640px) { .ins { grid-template-columns: 1fr; } }
</style>
