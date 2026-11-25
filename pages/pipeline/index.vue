<script setup lang="ts">
import { shortAmount } from '~/shared/compact'
import type { PipelineCard } from '~/server/api/pipeline/index.get'
useHead({ title: 'Pipeline' })
const { data, error, refresh } = await useFetch<PipelineCard[]>('/api/pipeline')
const COLS = [
  { v: 'screening', label: 'Screening' }, { v: 'first_call', label: 'First call' }, { v: 'diligence', label: 'Diligence' },
  { v: 'ic', label: 'IC' }, { v: 'invested', label: 'Invested' }
]
const ROUND: Record<string, string> = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', later: 'Later' }
const showPassed = ref(false)
const { data: entities } = await useFetch<{ id: string; name: string; kind: string }[]>('/api/entities')
const vehicles = computed(() => (entities.value ?? []).filter((e) => ['fund', 'spv'].includes(e.kind)))
const vehicle = ref('')
const inView = computed(() => (data.value ?? []).filter((d) => !vehicle.value || d.vehicle_id === vehicle.value))
const col = (s: string) => inView.value.filter((d) => d.stage === s)
const passed = computed(() => inView.value.filter((d) => d.stage === 'passed'))
const days = (s: string) => Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86400000))
const money = (v: string | null) => (v ? shortAmount(v) : '')
const adding = ref(false)
// Drag a card to another stage. The move shows at once and is undone if the server refuses it (for example Invested
// without enough IC approvals); the deal page still offers every move, including Passed.
const drag = reactive({ id: '' as string, over: '' as string, busy: false })
function dragStart(ev: DragEvent, id: string) { drag.id = id; ev.dataTransfer?.setData('text/plain', id); if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move' }
function dragEnd() { drag.id = ''; drag.over = '' }
function dragOver(ev: DragEvent, stage: string) { if (!drag.id) return; ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'; drag.over = stage }
function dragLeave(ev: DragEvent, stage: string) { const to = ev.relatedTarget as Node | null; if (drag.over === stage && !(to && (ev.currentTarget as HTMLElement).contains(to))) drag.over = '' }
async function drop(ev: DragEvent, stage: string) {
  ev.preventDefault()
  const id = drag.id || ev.dataTransfer?.getData('text/plain') || ''
  drag.id = ''; drag.over = ''
  const d = (data.value ?? []).find((x) => x.id === id)
  if (!d || d.stage === stage || drag.busy) return
  const was = d.stage, since = d.stage_since
  d.stage = stage as typeof d.stage; d.stage_since = new Date().toISOString()
  drag.busy = true
  try { await $fetch('/api/pipeline/' + id + '/stage', { method: 'POST', body: { stage } }) }
  catch (e) { d.stage = was; d.stage_since = since; notify((e as { data?: { message?: string } })?.data?.message ?? 'Could not move this deal. Try again.', { title: 'Not moved' }) }
  finally { drag.busy = false }
}
</script>

<template>
  <section>
    <p class="label">Venture Capital</p>
    <div class="head">
      <h1>Pipeline</h1>
      <div class="tools">
        <select v-model="vehicle" aria-label="Filter by vehicle"><option value="">All funds</option><option v-for="v in vehicles" :key="v.id" :value="v.id">{{ v.name }}</option></select>
        <button class="btn" type="button" @click="adding = true">Add deal</button>
      </div>
    </div>

    <AddDealDialog :open="adding" :vehicles="vehicles" @close="adding = false" />

    <p v-if="error" class="error" role="alert">Could not load the pipeline.</p>
    <EmptyState v-else-if="!COLS.some((c) => col(c.v).length) && !passed.length" card icon="pipeline" title="Your pipeline is empty" text="Add the companies you are looking at and move them from screening to IC and investment. Pitches from your pitch form can be moved here too."><button class="btn" @click="adding = true">Add a deal</button><NuxtLink to="/deals" class="btn secondary">See pitches</NuxtLink></EmptyState>
    <template v-else><div class="dk"><div v-for="c in COLS" :key="c.v" class="k"><em>{{ c.label }}</em><b>{{ col(c.v).length }}</b></div></div>
    <p class="hint">Drag a deal to another stage to move it.</p>
    <div class="board">
      <div v-for="c in COLS" :key="c.v" class="col" :class="{ over: drag.over === c.v }" @dragover="dragOver($event, c.v)" @dragleave="dragLeave($event, c.v)" @drop="drop($event, c.v)">
        <h2>{{ c.label }} <span>{{ col(c.v).length }}</span></h2>
        <div class="list">
        <NuxtLink v-for="d in col(c.v)" :key="d.id" :to="'/pipeline/' + d.id" class="cardlet" :class="{ dragging: drag.id === d.id }" draggable="true" :title="'Drag to another stage, or open ' + d.company" @dragstart="dragStart($event, d.id)" @dragend="dragEnd">
          <b>{{ d.company }}</b>
          <span v-if="d.one_liner" class="one">{{ d.one_liner }}</span>
          <span v-if="d.sector || d.country" class="meta">{{ [d.sector, d.country].filter(Boolean).join(' · ') }}</span>
          <span class="meta">{{ [d.round ? ROUND[d.round] : '', money(d.raise_usd)].filter(Boolean).join(' · ') }}</span>
          <span class="meta">{{ d.owner ?? 'No owner' }} · {{ days(d.stage_since) }}d in stage</span>
          <span v-if="d.vehicle" class="veh">{{ d.vehicle }}</span>
        </NuxtLink>
        <p v-if="!col(c.v).length" class="none">No deals</p>
        </div>
      </div>
    </div>

    </template>
    <button v-if="passed.length" type="button" class="link" @click="showPassed = !showPassed">{{ showPassed ? 'Hide' : 'Show' }} passed ({{ passed.length }})</button>
    <ul v-if="showPassed" class="passed">
      <li v-for="d in passed" :key="d.id"><NuxtLink :to="'/pipeline/' + d.id">{{ d.company }}</NuxtLink> <span>{{ d.one_liner }}</span></li>
    </ul>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; }
.tools { display: flex; gap: 10px; align-items: center; }
.veh { align-self: flex-start; font-size: 10.5px; letter-spacing: .04em; color: var(--c-blue-deep); background: #eef4f9; padding: 1px 6px; margin-top: 2px; }
.add { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 16px; align-items: end; margin-bottom: 20px; }
.add label { display: flex; flex-direction: column; gap: 6px; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.board { display: grid; grid-template-columns: repeat(5, minmax(180px, 1fr)); gap: 12px; overflow-x: auto; }
.board { align-items: start; }
/* Each column keeps to the screen's height and scrolls on its own, so a stage with 100 deals doesn't make the page long. */
.col { background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 12px 6px 12px 12px; min-height: 240px; max-height: max(420px, calc(100vh - 150px)); display: flex; flex-direction: column; }
.list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding-right: 6px; min-height: 0; flex: 1; overscroll-behavior: contain; scrollbar-width: thin; }
.col h2 { font-family: var(--font-body); font-size: 11px; letter-spacing: 0; color: var(--c-muted); font-weight: 500; margin: 0 6px 10px 0; display: flex; justify-content: space-between; flex: none; }
.cardlet { flex: none; display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 1px solid var(--c-rule); border-radius: var(--radius); background: var(--c-paper); text-decoration: none; color: var(--c-ink-soft); }
.cardlet:hover { border-color: var(--c-blue); }
.cardlet { cursor: grab; } .cardlet:active { cursor: grabbing; } .cardlet.dragging { opacity: .45; }
.col { transition: background .12s, border-color .12s; } .col.over { background: #f3f7fc; border-color: var(--c-blue-deep); box-shadow: inset 0 0 0 1px var(--c-blue-deep); }
.hint { font-size: 12.5px; color: var(--c-muted); margin: 0 0 10px; }
.cardlet b { color: var(--c-navy); font-weight: 500; }
.one { font-size: 12.5px; color: var(--c-muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.meta { font-size: 11.5px; color: var(--c-muted); }
.none { color: var(--c-rule-strong); margin: 0; }
.link { background: none; border: 0; padding: 0; margin-top: 18px; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.passed { padding-left: 18px; } .passed span { color: var(--c-muted); font-size: 13px; }
.error { color: var(--c-danger); }
@media (max-width: 1000px) { .add { grid-template-columns: 1fr 1fr; } }
.mng { font-size: 12px; text-transform: none; letter-spacing: 0; }
.mfrm { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .mfrm label.label { display: flex; flex-direction: column; gap: 6px; } .mfrm .btn, .mfrm .hint, .mfrm .error { grid-column: 1 / -1; } .mfrm .btn { justify-self: start; }
.dk { display: flex; gap: 10px; margin: 16px 0; flex-wrap: wrap; } .k { flex: 1; min-width: 120px; background: #fff; border: 1px solid var(--c-rule); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; } .k em { font-style: normal; font-size: 12px; color: var(--c-muted); } .k b { font-size: 22px; font-weight: 600; letter-spacing: -.02em; }
.cardlet { transition: border-color .12s, box-shadow .12s, transform .12s; } .cardlet:hover { border-color: var(--c-navy) !important; box-shadow: 0 6px 18px rgba(12,26,46,.08); transform: translateY(-1px); } .none { color: var(--c-muted); font-size: 12.5px; text-align: center; padding: 14px 0; }
</style>
