<script setup lang="ts">
// What to do next: advice from the company's own figures, by team, sorted into what to fix urgently, what to do next
// and what is working. Guidance only, with a disclaimer.
useHead({ title: 'What to do next' })
interface Item { kind: 'urgent' | 'next' | 'working'; team: string; title: string; why: string; steps: string[]; watch: string; target: string; when: string }
interface Res { subject: string; name: string; advice: { as_of: string | null; currency: string; items: Item[]; ai: boolean; sources: string[]; generated_at: string } | null }
const refreshQ = ref<string | undefined>(undefined)
// For the company (or the group) chosen at the top of Financials.
const fs = await useFinScope()
const { data: fresh, pending, refresh } = await useLazyFetch<Res>('/api/financials/advice', { query: { subject: fs.s, refresh: refreshQ }, watch: [fs.s], server: false })
// The advice saved last time shows at once while the fresh one is worked out (which can take a while with AI).
const { data: last } = await useLazyFetch<Res>('/api/financials/advice', { query: { subject: fs.s, cached: '1' }, watch: [fs.s], server: false })
const data = computed(() => fresh.value ?? (last.value?.advice && last.value.subject === fs.s.value ? last.value : null))
async function again() { refreshQ.value = '1'; await refresh(); refreshQ.value = undefined }
const team = ref('')
const items = computed(() => (data.value?.advice?.items ?? []).filter((i) => !team.value || i.team === team.value))
const teams = computed(() => [...new Set((data.value?.advice?.items ?? []).map((i) => i.team))])
const SECT: { k: Item['kind']; t: string; s: string }[] = [
  { k: 'urgent', t: 'Fix urgently', s: 'Risks to the business: start this month.' },
  { k: 'next', t: 'Do next', s: 'Over the next one to two quarters.' },
  { k: 'working', t: 'What is working', s: 'Keep doing these, and do more of them.' }]
// Actions per team, split by kind, for the bar chart (click a team to show only its actions).
const byTeam = computed(() => teams.value.map((t) => { const xs = (data.value?.advice?.items ?? []).filter((i) => i.team === t); return { t, u: xs.filter((i) => i.kind === 'urgent').length, n: xs.filter((i) => i.kind === 'next').length, w: xs.filter((i) => i.kind === 'working').length, all: xs.length } }).sort((a, b) => b.u - a.u || b.all - a.all))
const maxT = computed(() => Math.max(1, ...byTeam.value.map((x) => x.all)))
const pc = (n: number) => (n / maxT.value) * 100 + '%'
const of = (k: Item['kind']) => items.value.filter((i) => i.kind === k)
const mon = (d: string | null) => (d ? new Date(d.slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '')
</script>

<template>
  <section>
    <FinHeader />
    <div class="head"><div><p class="sub">{{ data?.advice?.as_of ? 'From your figures to ' + mon(data.advice.as_of) : '' }}</p></div>
      <div v-if="data?.advice" class="tools"><select v-model="team" aria-label="Team"><option value="">All teams</option><option v-for="t in teams" :key="t" :value="t">{{ t }}</option></select><button class="btn secondary" type="button" :disabled="pending" @click="again"><AiSpark v-if="pending" :size="14" /> {{ pending ? 'Working…' : 'Refresh' }}</button></div></div>


    <p class="disc1" role="note"><b>Guidance, not professional advice.</b> Worked out from your figures; check anything financial, legal, tax or about people with your advisers.</p>
    <AiThinking v-if="pending && data" compact :steps="['Checking your latest figures…', 'Updating the advice…']" />
    <AiThinking v-if="pending && !data" :steps="['Reading your figures…', 'Checking revenue, costs and cash…', 'Looking at customers and retention…', 'Working out what each team should do…', 'Writing it up…']" :skeleton="3" />
    <EmptyState v-else-if="data && !data.advice" card icon="chart" title="Add your figures first" text="Advice needs at least three months of figures in Financials, or your customer revenue." />
    <template v-else-if="data?.advice">
      <div class="top">
        <div class="cnt"><div v-for="s in SECT" :key="s.k" :class="s.k"><b>{{ of(s.k).length }}</b><span>{{ s.t }}</span></div></div>
        <div class="card bt"><div class="bth"><h3>By team</h3><span class="lg"><i class="u" />Fix urgently<i class="n" />Do next<i class="w" />Working</span></div>
          <button v-for="x in byTeam" :key="x.t" type="button" class="tr" :class="{ on: team === x.t }" @click="team = team === x.t ? '' : x.t"><span class="tl">{{ x.t }}</span><span class="tb"><i class="u" :style="{ width: pc(x.u) }" /><i class="n" :style="{ width: pc(x.n) }" /><i class="w" :style="{ width: pc(x.w) }" /></span><b>{{ x.all }}</b></button></div>
      </div>
      <div v-for="s in SECT" :key="s.k" class="sec">
        <div class="sh" :class="s.k"><h2>{{ s.t }}</h2><span>{{ s.s }}</span></div>
        <div v-if="of(s.k).length" class="grid">
          <article v-for="(i, n) in of(s.k)" :key="n" class="card it" :class="s.k">
            <div class="meta"><span class="team">{{ i.team }}</span><span class="when">{{ i.when }}</span></div>
            <h3>{{ i.title }}</h3>
            <p class="why">{{ i.why }}</p>
            <details v-if="i.steps.length" class="how"><summary>How to go about it ({{ i.steps.length }} step{{ i.steps.length === 1 ? '' : 's' }})</summary><ol><li v-for="(st, k) in i.steps" :key="k">{{ st }}</li></ol></details>
            <div class="foot"><span>Watch <b>{{ i.watch }}</b></span><span>Target <b>{{ i.target }}</b></span></div>
          </article>
        </div>
        <p v-else class="mut none">{{ s.k === 'urgent' ? 'Nothing urgent in the figures.' : s.k === 'working' ? 'Nothing stands out yet; it will show as the figures improve.' : 'Nothing for now.' }}</p>
      </div>
      <p class="mut sm">{{ data.advice.ai ? 'Written up with AI from the numbers; the numbers come from your figures.' : 'Worked out from your figures by fixed rules.' }} Updated {{ new Date(data.advice.generated_at).toLocaleDateString('en-GB') }}; it refreshes when your figures change. <NuxtLink to="/financials">Financials</NuxtLink> · <NuxtLink to="/financials/retention">Revenue retention</NuxtLink> · <NuxtLink to="/financials/customers">Customers</NuxtLink></p>
    </template>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; } .head h1 { margin: 0; } .sub { margin: 4px 0 0; color: var(--c-muted); font-size: 14px; }
.tools { display: flex; gap: 8px; } .tools select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.disc { border: 1px solid #d9e2ef; background: #f5f7fb; padding: 12px 16px; font-size: 13px; color: var(--c-ink-soft); line-height: 1.55; margin-bottom: 16px; } .disc b { color: var(--c-ink); font-weight: 500; }
.cnt { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--c-rule); background: #fff; margin-bottom: 18px; } .cnt > div { padding: 14px 18px; border-right: 1px solid var(--c-rule); display: flex; align-items: baseline; gap: 10px; } .cnt > div:last-child { border-right: 0; }
.cnt b { font-family: var(--font-heading); font-size: 28px; line-height: 1.15; font-weight: 500; letter-spacing: -.02em; } .cnt span { font-size: 13px; font-weight: 500; color: var(--c-muted); } .cnt .urgent b { color: #9b3b32; } .cnt .next b { color: var(--c-navy); } .cnt .working b { color: #2f5ea8; }
.sec { margin-bottom: 22px; } .sh { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--c-rule-strong); } .sh h2 { margin: 0; font-size: var(--type-title, 19px); font-weight: 500; color: var(--c-navy); } .sh span { font-size: 13px; color: var(--c-muted); }
.sh.urgent { border-bottom-color: #b2453b; } .sh.next { border-bottom-color: var(--c-navy); } .sh.working { border-bottom-color: #9fb4d6; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.it { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; } .it h3 { margin: 0; font-size: 17px; font-weight: 500; line-height: 1.35; letter-spacing: -.01em; color: var(--c-navy); }
.meta { display: flex; justify-content: space-between; gap: 8px; font-size: 11.5px; } .team { padding: 2px 8px; background: var(--c-paper-2, #f4f6fa); color: var(--c-ink-soft); font-weight: 500; } .when { color: var(--c-muted); }
.it.urgent .team { background: #f8e8e6; color: #9b3b32; } .it.working .team { background: #e8eef8; color: var(--c-navy); }
.why { margin: 0; font-size: 13.5px; color: var(--c-ink-soft); line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.how summary { cursor: pointer; font-size: 13px; color: var(--c-blue-deep); list-style: none; } .how summary::-webkit-details-marker { display: none; } .how ol { margin: 4px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; line-height: 1.5; }
.foot { margin-top: auto; padding-top: 8px; border-top: 1px solid var(--c-rule); display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12.5px; color: var(--c-muted); } .foot b { color: var(--c-ink); font-weight: 500; }
.mut { color: var(--c-muted); font-size: 13.5px; } .none { margin: 0 0 6px; } .sm { font-size: 12.5px; }
@media (max-width: 700px) { .cnt { grid-template-columns: 1fr; } .cnt > div { border-right: 0; border-bottom: 1px solid var(--c-rule); } }
.top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 12px; margin-bottom: 18px; align-items: stretch; } .top .cnt { margin: 0; grid-template-columns: 1fr; } .top .cnt > div { border-right: 0; border-bottom: 1px solid var(--c-rule); } .top .cnt > div:last-child { border-bottom: 0; }
.bt { padding: 14px 18px; display: flex; flex-direction: column; gap: 6px; } .bth { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; } .bth h3 { margin: 0; font-size: 15px; font-weight: 500; }
.lg { display: flex; align-items: center; gap: 5px 12px; flex-wrap: wrap; font-size: 12px; color: var(--c-muted); } .lg i { display: inline-block; width: 9px; height: 9px; margin-right: -6px; }
.tr { display: grid; grid-template-columns: 130px 1fr 28px; gap: 10px; align-items: center; background: none; border: 0; padding: 4px 0; font: inherit; font-size: 13px; color: var(--c-ink); cursor: pointer; text-align: left; } .tr.on .tl { color: var(--c-blue-deep); font-weight: 500; } .tr b { font-weight: 500; text-align: right; }
.tl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .tb { display: flex; height: 12px; background: var(--c-paper-2, #f4f6fa); } .tb i, .lg i { display: block; height: 100%; } .u { background: #b2453b; } .n { background: var(--c-navy); } .w { background: #9fb4d6; } .lg i { height: 9px; }
@media (max-width: 800px) { .top { grid-template-columns: 1fr; } }
.disc1 { margin: 0 0 14px; font-size: 12.5px; color: var(--c-muted); } .disc1 b { font-weight: 500; color: var(--c-ink-soft); }
</style>
