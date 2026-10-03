<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
interface Detail { summary: string[]; strengths: string[]; concerns: string[]; questions_for_founder: string[]; flags: string[] }
interface ScreeningRow { id: string; created_at: string; score: number; recommendation: string; thesis_fit: number; team_score: number; market_score: number; traction_score: number; detail: Detail; model: string; prompt_version: string; cost_usd: string | null }
interface DecisionRow { id: string; decision: string; note: string; decided_at: string; decided_by: string }
interface Pitch { id: string; received_at: string; founder_name: string; email: string; company: string; website: string | null; deck_url: string | null; country: string | null; stage: string; sector: string | null; raising_usd: string | null; one_liner: string; description: string; traction: string | null; team: string | null; female_founder: boolean | null; status: string }
const { data, error, refresh } = await useFetch<{ pitch: Pitch; screenings: ScreeningRow[]; decisions: DecisionRow[]; failedRuns: number; dealId: string | null }>('/api/deals/' + id)
useHead({ title: () => (data.value?.pitch.company ?? 'Pitch') })
const REC: Record<string, string> = { prioritise: 'Prioritise', review: 'Review', likely_pass: 'Likely pass' }
const STAGE: Record<string, string> = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', later: 'Later' }
const latest = computed(() => data.value?.screenings[0])
const decision = ref<'advance' | 'hold' | 'decline' | ''>('')
const note = ref('')
const busy = ref(false)
const msg = ref('')
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null)
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function decide() {
  if (!decision.value) return
  busy.value = true; msg.value = ''
  try { await $fetch('/api/deals/' + id + '/decision', { method: 'POST', body: { decision: decision.value, note: note.value } }); note.value = ''; decision.value = ''; await refresh() }
  catch (e) { msg.value = errText(e) } finally { busy.value = false }
}
async function rescreen() {
  busy.value = true; msg.value = ''
  try { await $fetch('/api/deals/' + id + '/screen', { method: 'POST' }); await refresh() }
  catch (e) { msg.value = errText(e) } finally { busy.value = false }
}
const money = (v: string | null) => (v ? '$' + Number(v).toLocaleString('en-US') : '—')
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/deals" class="back">← Pitches</NuxtLink>
    <NuxtLink v-if="data.dealId" :to="'/pipeline/' + data.dealId" class="inpipe">In the pipeline →</NuxtLink>
    <p class="label">{{ STAGE[data.pitch.stage] }} · {{ data.pitch.sector ?? 'Sector not given' }} · {{ data.pitch.country ?? 'Country not given' }}</p>
    <h1>{{ data.pitch.company }}</h1>
    <p class="lead">{{ data.pitch.one_liner }}</p>

    <div class="grid">
      <div class="col">
        <div class="card">
          <h2>The pitch</h2>
          <dl class="facts">
            <dt>Founder</dt><dd>{{ data.pitch.founder_name }} · <a :href="'mailto:' + data.pitch.email">{{ data.pitch.email }}</a></dd>
            <dt>Raising</dt><dd>{{ money(data.pitch.raising_usd) }}</dd>
            <dt>Website</dt><dd><a v-if="safeUrl(data.pitch.website)" :href="safeUrl(data.pitch.website)!" target="_blank" rel="noopener noreferrer">{{ data.pitch.website }}</a><span v-else>{{ data.pitch.website ?? '—' }}</span></dd>
            <dt>Deck</dt><dd><a v-if="safeUrl(data.pitch.deck_url)" :href="safeUrl(data.pitch.deck_url)!" target="_blank" rel="noopener noreferrer">Open deck</a><span v-else>—</span></dd>
            <dt>Received</dt><dd>{{ when(data.pitch.received_at) }}</dd>
          </dl>
          <h3>What they're building</h3><p class="pre">{{ data.pitch.description }}</p>
          <h3>Traction</h3><p class="pre">{{ data.pitch.traction ?? '—' }}</p>
          <h3>Team</h3><p class="pre">{{ data.pitch.team ?? '—' }}</p>
        </div>
      </div>

      <div class="col">
        <div class="card">
          <div class="row"><h2>AI screening</h2><button class="btn secondary sm" :disabled="busy" @click="rescreen">{{ busy ? 'Working…' : (latest ? 'Re-screen' : 'Screen now') }}</button></div>
          <p class="advice">Advice only. A partner makes every decision.</p>
          <template v-if="latest">
            <p class="big" :data-rec="latest.recommendation">{{ latest.score }}<span>/100</span> · {{ REC[latest.recommendation] }}</p>
            <ul class="bars">
              <li>Thesis fit <b>{{ latest.thesis_fit }}/5</b></li><li>Team <b>{{ latest.team_score }}/5</b></li>
              <li>Market <b>{{ latest.market_score }}/5</b></li><li>Traction <b>{{ latest.traction_score }}/5</b></li>
            </ul>
            <ul class="summary"><li v-for="(s, i) in latest.detail.summary" :key="i">{{ s }}</li></ul>
            <p v-if="latest.detail.flags.length" class="flags"><span v-for="f in latest.detail.flags" :key="f">{{ f }}</span></p>
            <h3>Strengths</h3><ul><li v-for="(s, i) in latest.detail.strengths" :key="i">{{ s }}</li></ul>
            <h3>Concerns</h3><ul><li v-for="(s, i) in latest.detail.concerns" :key="i">{{ s }}</li></ul>
            <h3>Questions for the founder</h3><ul><li v-for="(s, i) in latest.detail.questions_for_founder" :key="i">{{ s }}</li></ul>
            <p class="meta">{{ latest.model }} · {{ latest.prompt_version }} · {{ when(latest.created_at) }}<template v-if="latest.cost_usd"> · ${{ Number(latest.cost_usd).toFixed(4) }}</template></p>
          </template>
          <p v-else class="muted">Not screened yet<template v-if="data.failedRuns"> ({{ data.failedRuns }} failed attempt{{ data.failedRuns === 1 ? '' : 's' }} logged)</template>.</p>
        </div>

        <div class="card">
          <h2>Decision</h2>
          <form @submit.prevent="decide">
            <div class="choices">
              <label v-for="d in (['advance', 'hold', 'decline'] as const)" :key="d"><input v-model="decision" type="radio" name="decision" :value="d"> {{ d === 'advance' ? 'Advance' : d === 'hold' ? 'Hold' : 'Decline' }}</label>
            </div>
            <label for="note" class="label">Note (required)</label>
            <textarea id="note" v-model="note" rows="3" required minlength="3" />
            <button class="btn" type="submit" :disabled="busy || !decision">Record decision</button>
          </form>
          <p v-if="msg" class="error" role="alert">{{ msg }}</p>
          <ul v-if="data.decisions.length" class="log">
            <li v-for="d in data.decisions" :key="d.id"><b>{{ d.decision }}</b> by {{ d.decided_by }} · {{ when(d.decided_at) }}<span>{{ d.note }}</span></li>
          </ul>
        </div>
      </div>
    </div>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Pitch not found.' : 'Could not load this pitch.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
.inpipe { float: right; color: var(--c-blue-deep); text-decoration: none; font-weight: 500; }
.lead { color: var(--c-muted); margin: 8px 0 24px; max-width: 70ch; }
.grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
h2 { margin-bottom: 12px; } h3 { font-family: var(--font-body); font-size: 12px; letter-spacing: 0; color: var(--c-muted); margin: 18px 0 6px; font-weight: 500; }
.facts { display: grid; grid-template-columns: 90px 1fr; gap: 6px 12px; margin: 0; }
.facts dt { color: var(--c-muted); } .facts dd { margin: 0; overflow-wrap: anywhere; }
.pre { white-space: pre-wrap; margin: 0; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.btn.sm { padding: 6px 12px; font-size: 13px; }
.advice { color: var(--c-muted); font-size: 12px; margin: 0 0 12px; }
.big { font-size: 30px; font-weight: 500; letter-spacing: -0.02em; color: var(--c-navy); margin: 0 0 10px; } .big span { font-size: 18px; color: var(--c-muted); }
.big[data-rec="prioritise"] { color: var(--c-ok); }
.bars { list-style: none; padding: 0; margin: 0 0 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; } .bars b { font-weight: 600; }
.summary { padding-left: 18px; } .summary li { margin-bottom: 4px; }
.flags span { display: inline-block; font-size: 11px; background: var(--c-paper-2); border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 2px 8px; margin: 0 6px 6px 0; }
ul { padding-left: 18px; margin: 0; }
.meta { color: var(--c-muted); font-size: 12px; margin-top: 16px; }
.choices { display: flex; gap: 18px; margin-bottom: 12px; }
textarea { width: 100%; font: inherit; padding: 10px; border: 1px solid var(--c-rule-strong); margin: 6px 0 12px; resize: vertical; }
.log { list-style: none; padding: 0; margin: 18px 0 0; border-top: 1px solid var(--c-rule); }
.log li { padding: 10px 0; border-bottom: 1px solid var(--c-rule); } .log span { display: block; color: var(--c-muted); margin-top: 2px; white-space: pre-wrap; }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
