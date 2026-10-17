<script setup lang="ts">
// What the founder's figures say, in plain words: a headline, what is going well or needs watching, and what to take
// to the executive team, the CFO and the board. Kept until the figures change; refresh on demand.
const props = defineProps<{ subject: string }>()
interface A { headline: string; insights: { title: string; detail: string; tone: 'good' | 'watch' | 'risk' }[]; flags: { for: string; item: string; why: string }[]; checks: number; ai: boolean; as_of: string; period: string }
const refreshQ = ref<string | undefined>(undefined)
const { data, pending, refresh } = await useLazyFetch<A | null>('/api/financials/analysis', { query: { subject: computed(() => props.subject), refresh: refreshQ }, server: false })
async function again() { refreshQ.value = '1'; await refresh(); refreshQ.value = undefined }
const groups = computed(() => { const m = new Map<string, A['flags']>(); for (const f of data.value?.flags ?? []) m.set(f.for, [...(m.get(f.for) ?? []), f]); return [...m.entries()] })
const TONE: Record<string, string> = { good: 'Going well', watch: 'Watch', risk: 'Risk' }
</script>
<template>
  <section class="fa">
    <div class="fah"><span class="eyebrow">What your numbers say</span><span class="meta">{{ data ? data.period + (data.ai ? '' : ' · worked out from your figures') : '' }}<button v-if="data" class="lk" :disabled="pending" @click="again">{{ pending ? 'Reading…' : 'Refresh' }}</button></span></div>
    <p v-if="pending && !data" class="skel">Reading your figures…</p>
    <template v-else-if="data">
      <h2 class="hl">{{ data.headline }}</h2>
      <div class="ins"><article v-for="(i, n) in data.insights" :key="n" :class="i.tone"><em>{{ TONE[i.tone] }}</em><b>{{ i.title }}</b><p>{{ i.detail }}</p></article></div>
      <div v-if="groups.length" class="tk"><h3>Take to your team</h3>
        <div class="tkg"><div v-for="[who, items] in groups" :key="who"><span class="who">{{ who }}</span><ul><li v-for="(f, n) in items" :key="n"><b>{{ f.item }}</b><span>{{ f.why }}</span></li></ul></div></div></div>
      <p v-if="data.checks" class="ft">{{ data.checks }} total{{ data.checks === 1 ? '' : 's' }} in your figures do not add up; the analysis may be off until they are fixed.</p>
    </template>
    <p v-else class="skel">Add three or more months of figures to see the analysis.</p>
  </section>
</template>
<style scoped>
.fa { background: #fff; border: 1px solid var(--c-rule); padding: 22px 24px 20px; margin: 0 0 12px; }
.fah { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .eyebrow { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--c-muted); } .meta { font-size: 12px; color: var(--c-muted); display: flex; gap: 12px; align-items: center; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; }
.hl { font-family: var(--font-heading); font-weight: 500; font-size: 22px; line-height: 1.3; color: var(--c-navy); margin: 10px 0 18px; max-width: 70ch; }
.ins { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1px; background: var(--c-rule); border: 1px solid var(--c-rule); }
.ins article { background: #fff; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; position: relative; } .ins article::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--c-navy); } .ins article.watch::before { background: #c98a1c; } .ins article.risk::before { background: var(--c-danger); }
.ins em { font-style: normal; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); } .ins b { font-size: 14.5px; font-weight: 600; color: var(--c-ink); } .ins p { margin: 0; font-size: 13px; color: var(--c-ink-soft); line-height: 1.5; }
.tk { margin-top: 18px; } .tk h3 { font-size: 13px; font-weight: 600; margin: 0 0 10px; color: var(--c-ink); }
.tkg { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px 22px; } .who { display: inline-block; font-size: 11.5px; padding: 2px 8px; background: var(--c-navy); color: #fff; margin-bottom: 6px; }
.tkg ul { list-style: none; margin: 0; padding: 0; } .tkg li { padding: 7px 0; border-bottom: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 2px; font-size: 13px; } .tkg li b { font-weight: 600; color: var(--c-ink); } .tkg li span { color: var(--c-ink-soft); }
.ft { margin: 14px 0 0; font-size: 12.5px; color: #8a5a0a; } .skel { color: var(--c-muted); font-size: 13.5px; margin: 10px 0 0; }
</style>
