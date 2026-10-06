<script setup lang="ts">
// Desk: the founder's fundraising brief, laid out for reading, with a link to the fundraising workspace.
const props = defineProps<{ jobId: string }>()
const { data } = await useFetch<{ id: string; status: string; currency: string; target: number | null; round: string | null; instrument: string | null; valuation: number | null; fee_pct: number; intake: Record<string, string | number | null>; intake_at: string | null } | null>(() => '/api/services/raise/by-job/' + props.jobId)
const money = (v: unknown) => (v == null || v === '' ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value?.currency ?? 'USD', maximumFractionDigits: 0 }).format(Number(v)))
const lines = (s: unknown) => String(s ?? '').split(/\n+/).map((x) => x.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean)
const chips = (s: unknown) => String(s ?? '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)
</script>
<template>
  <div v-if="data" class="card rb">
    <div class="rh"><div><span class="eb">Managed fundraising brief</span><h2>{{ data.round }} · {{ money(data.target) }}</h2><p class="mut">{{ data.instrument }}{{ data.valuation ? ' · valuation or cap ' + money(data.valuation) : '' }} · success fee {{ data.fee_pct }}%{{ data.intake_at ? ' · received ' + new Date(data.intake_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '' }}</p></div>
      <NuxtLink :to="'/services/raise/' + data.id" class="btn">Open fundraising workspace →</NuxtLink></div>
    <div class="facts"><div><span>Target</span><b>{{ money(data.target) }}</b></div><div><span>Raised so far</span><b>{{ money(data.intake.raised_so_far) }}</b></div><div><span>Timeline</span><b>{{ data.intake.timeline || '—' }}</b></div><div><span>Currency</span><b>{{ data.currency }}</b></div></div>
    <div class="secs">
      <div v-if="data.intake.use_of_funds"><h3>Use of funds</h3><ul><li v-for="(l, i) in lines(data.intake.use_of_funds)" :key="i">{{ l }}</li></ul></div>
      <div v-if="data.intake.traction"><h3>Traction</h3><p class="pre">{{ data.intake.traction }}</p></div>
      <div v-if="data.intake.target_investors"><h3>Investors they suggest</h3><div class="chips"><span v-for="c in chips(data.intake.target_investors)" :key="c">{{ c }}</span></div></div>
      <div v-if="data.intake.deck_url"><h3>Deck</h3><a :href="String(data.intake.deck_url)" target="_blank" rel="noopener" class="deck">Open the deck ↗</a></div></div>
  </div>
</template>
<style scoped>
.rb { margin: 12px 0 16px; display: flex; flex-direction: column; gap: 16px; } .rh { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; } .rh h2 { margin: 2px 0 4px; font-size: 22px; } .rh .btn { text-decoration: none; }
.eb { font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--c-blue-deep); font-weight: 600; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; }
.facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; } .facts div { background: var(--c-paper-2); padding: 10px 12px; } .facts span { display: block; font-size: 12px; color: var(--c-muted); } .facts b { font-size: 16px; font-weight: 600; }
.secs { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; } h3 { font-size: 13px; margin: 0 0 6px; color: var(--c-ink-soft); } ul { margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.55; } .pre { white-space: pre-wrap; font-size: 13.5px; margin: 0; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips span { background: var(--c-signal-soft); color: var(--c-blue-deep); font-size: 12.5px; padding: 3px 10px; } .deck { color: var(--c-blue-deep); font-size: 13.5px; }
@media (max-width: 900px) { .facts, .secs { grid-template-columns: 1fr 1fr; } }
</style>
