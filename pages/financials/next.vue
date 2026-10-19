<script setup lang="ts">
// What to do next: advice from the company's own figures, by team, sorted into what to fix urgently, what to do next
// and what is working. Guidance only, with a disclaimer.
useHead({ title: 'What to do next' })
interface Item { kind: 'urgent' | 'next' | 'working'; team: string; title: string; why: string; steps: string[]; watch: string; target: string; when: string }
interface Res { subject: string; name: string; advice: { as_of: string | null; currency: string; items: Item[]; ai: boolean; sources: string[]; generated_at: string } | null }
const refreshQ = ref<string | undefined>(undefined)
const { data, pending, refresh } = await useLazyFetch<Res>('/api/financials/advice', { query: { refresh: refreshQ }, server: false })
async function again() { refreshQ.value = '1'; await refresh(); refreshQ.value = undefined }
const team = ref('')
const items = computed(() => (data.value?.advice?.items ?? []).filter((i) => !team.value || i.team === team.value))
const teams = computed(() => [...new Set((data.value?.advice?.items ?? []).map((i) => i.team))])
const SECT: { k: Item['kind']; t: string; s: string }[] = [
  { k: 'urgent', t: 'Fix urgently', s: 'Risks to the business: start this month.' },
  { k: 'next', t: 'Do next', s: 'Over the next one to two quarters.' },
  { k: 'working', t: 'What is working', s: 'Keep doing these, and do more of them.' }]
const of = (k: Item['kind']) => items.value.filter((i) => i.kind === k)
const mon = (d: string | null) => (d ? new Date(d.slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '')
</script>

<template>
  <section>
    <FinTabs />
    <div class="head"><div><h1>What to do next</h1><p class="sub">What each team should fix, do next and keep doing, worked out from your figures{{ data?.advice?.as_of ? ' to ' + mon(data.advice.as_of) : '' }}.</p></div>
      <div v-if="data?.advice" class="tools"><select v-model="team" aria-label="Team"><option value="">All teams</option><option v-for="t in teams" :key="t" :value="t">{{ t }}</option></select><button class="btn secondary" type="button" :disabled="pending" @click="again">{{ pending ? 'Working…' : 'Refresh' }}</button></div></div>

    <div class="disc" role="note"><b>Guidance, not professional advice.</b> These suggestions are worked out from the figures you entered ({{ data?.advice?.sources.join(' and ') || 'Financials' }}){{ data?.advice?.ai ? ' and written up with AI' : '' }}. They can be wrong, out of date or miss context only you have. Before acting on anything financial, legal, tax or about people, check with your accountant, lawyer or other advisers. Finvry is not responsible for decisions made on them.</div>

    <p v-if="pending && !data" class="mut">Looking at your figures…</p>
    <EmptyState v-else-if="data && !data.advice" card icon="chart" title="Add your figures first" text="Advice needs at least three months of figures in Financials, or your customer revenue." />
    <template v-else-if="data?.advice">
      <div class="cnt"><div v-for="s in SECT" :key="s.k" :class="s.k"><b>{{ of(s.k).length }}</b><span>{{ s.t }}</span></div></div>
      <div v-for="s in SECT" :key="s.k" class="sec">
        <div class="sh" :class="s.k"><h2>{{ s.t }}</h2><span>{{ s.s }}</span></div>
        <div v-if="of(s.k).length" class="grid">
          <article v-for="(i, n) in of(s.k)" :key="n" class="card it" :class="s.k">
            <div class="meta"><span class="team">{{ i.team }}</span><span class="when">{{ i.when }}</span></div>
            <h3>{{ i.title }}</h3>
            <p class="why">{{ i.why }}</p>
            <div class="how"><em>How to go about it</em><ol><li v-for="(st, k) in i.steps" :key="k">{{ st }}</li></ol></div>
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
.why { margin: 0; font-size: 13.5px; color: var(--c-ink-soft); line-height: 1.55; }
.how em { font-style: normal; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); } .how ol { margin: 4px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; line-height: 1.5; }
.foot { margin-top: auto; padding-top: 8px; border-top: 1px solid var(--c-rule); display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12.5px; color: var(--c-muted); } .foot b { color: var(--c-ink); font-weight: 500; }
.mut { color: var(--c-muted); font-size: 13.5px; } .none { margin: 0 0 6px; } .sm { font-size: 12.5px; }
@media (max-width: 700px) { .cnt { grid-template-columns: 1fr; } .cnt > div { border-right: 0; border-bottom: 1px solid var(--c-rule); } }
</style>
