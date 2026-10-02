<script setup lang="ts">
import type { PipelineCard } from '~/server/api/pipeline/index.get'
useHead({ title: 'Pipeline — Aidi OS' })
const { data, error, refresh } = await useFetch<PipelineCard[]>('/api/pipeline')
const COLS = [
  { v: 'screening', label: 'Screening' }, { v: 'first_call', label: 'First call' }, { v: 'diligence', label: 'Diligence' },
  { v: 'ic', label: 'IC' }, { v: 'invested', label: 'Invested' }
]
const ROUND: Record<string, string> = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', later: 'Later' }
const showPassed = ref(false)
const { data: entities } = await useFetch<{ id: string; name: string; kind: string }[]>('/api/entities')
const vehicles = computed(() => (entities.value ?? []).filter((e) => ['fund', 'spv', 'holding', 'gp'].includes(e.kind)))
const vehicle = ref('')
const inView = computed(() => (data.value ?? []).filter((d) => !vehicle.value || d.vehicle_id === vehicle.value))
const col = (s: string) => inView.value.filter((d) => d.stage === s)
const passed = computed(() => inView.value.filter((d) => d.stage === 'passed'))
const days = (s: string) => Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86400000))
const money = (v: string | null) => (v ? '$' + (Number(v) >= 1e6 ? (Number(v) / 1e6).toFixed(1).replace('.0', '') + 'm' : Math.round(Number(v) / 1e3) + 'k') : '')
const adding = ref(false)
const form = reactive({ company: '', one_liner: '', website: '', round: '', raise_usd: '', source: 'referral', stage: 'screening', vehicle_entity_id: '' })
const msg = ref('')
async function add() {
  msg.value = ''
  try {
    const r = await $fetch<{ id: string }>('/api/pipeline', { method: 'POST', body: { ...form, round: form.round || undefined, raise_usd: form.raise_usd.replace(/[^0-9]/g, '') || undefined } })
    await navigateTo('/pipeline/' + r.id)
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add the deal.' }
}
</script>

<template>
  <section>
    <p class="label">Aidi Ventures</p>
    <div class="head">
      <h1>Pipeline</h1>
      <div class="tools">
        <select v-model="vehicle" aria-label="Filter by vehicle"><option value="">All vehicles</option><option v-for="v in vehicles" :key="v.id" :value="v.id">{{ v.name }}</option></select>
        <button class="btn" type="button" @click="adding = !adding">{{ adding ? 'Close' : 'Add deal' }}</button>
      </div>
    </div>

    <form v-if="adding" class="card add" @submit.prevent="add">
      <label class="label">Company<input v-model="form.company" required maxlength="200"></label>
      <label class="label">One-liner<input v-model="form.one_liner" maxlength="300"></label>
      <label class="label">Website<input v-model="form.website" maxlength="500" placeholder="https://"></label>
      <label class="label">Round<select v-model="form.round"><option value="">—</option><option v-for="(l, k) in ROUND" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="label">Raising (USD)<input v-model="form.raise_usd" inputmode="numeric"></label>
      <label class="label">Source<select v-model="form.source"><option value="referral">Referral</option><option value="network">Network</option><option value="outbound">Outbound</option><option value="other">Other</option></select></label>
      <label class="label">Vehicle<select v-model="form.vehicle_entity_id"><option value="">Aidi Ventures Fund I</option><option v-for="v in vehicles.filter((x) => x.name !== 'Aidi Ventures Fund I')" :key="v.id" :value="v.id">{{ v.name }}</option></select></label>
      <label class="label">Start at<select v-model="form.stage"><option value="screening">Screening</option><option value="first_call">First call</option><option value="diligence">Diligence</option></select></label>
      <button class="btn" type="submit">Add to pipeline</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    </form>

    <p v-if="error" class="error" role="alert">Could not load the pipeline.</p>
    <div v-else class="board">
      <div v-for="c in COLS" :key="c.v" class="col">
        <h2>{{ c.label }} <span>{{ col(c.v).length }}</span></h2>
        <NuxtLink v-for="d in col(c.v)" :key="d.id" :to="'/pipeline/' + d.id" class="cardlet">
          <b>{{ d.company }}</b>
          <span v-if="d.one_liner" class="one">{{ d.one_liner }}</span>
          <span class="meta">{{ [d.round ? ROUND[d.round] : '', money(d.raise_usd)].filter(Boolean).join(' · ') }}</span>
          <span class="meta">{{ d.owner ?? 'No owner' }} · {{ days(d.stage_since) }}d in stage</span>
          <span v-if="d.vehicle" class="veh">{{ d.vehicle }}</span>
        </NuxtLink>
        <p v-if="!col(c.v).length" class="none">—</p>
      </div>
    </div>

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
.col { background: #fff; border: 1px solid var(--c-rule); padding: 12px; min-height: 240px; display: flex; flex-direction: column; gap: 8px; }
.col h2 { font-family: var(--font-body); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; margin: 0 0 4px; display: flex; justify-content: space-between; }
.cardlet { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 1px solid var(--c-rule); background: var(--c-paper); text-decoration: none; color: var(--c-ink-soft); }
.cardlet:hover { border-color: var(--c-blue); }
.cardlet b { color: var(--c-navy); font-weight: 500; }
.one { font-size: 12.5px; color: var(--c-muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.meta { font-size: 11.5px; color: var(--c-muted); }
.none { color: var(--c-rule-strong); margin: 0; }
.link { background: none; border: 0; padding: 0; margin-top: 18px; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.passed { padding-left: 18px; } .passed span { color: var(--c-muted); font-size: 13px; }
.error { color: var(--c-danger); }
@media (max-width: 1000px) { .add { grid-template-columns: 1fr 1fr; } }
</style>
