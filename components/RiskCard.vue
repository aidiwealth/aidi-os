<script setup lang="ts">
// A wealth client's risk level and how their holdings fit it. Staff choose the level; clients take a short
// questionnaire (or pick a level) on their portal. Ratings and limits come from Wealth management → Settings.
import { RISK_LEVELS, RISK_QUESTIONS, RATING_LABEL, levelFromAnswers, levelLabel, type RiskFit } from '~/shared/risk'
const props = withDefaults(defineProps<{ fit: RiskFit; setBy?: string | null; setAt?: string | null; mode: 'staff' | 'client'; clientId?: string; preview?: boolean }>(), { setBy: null, setAt: null, clientId: '', preview: false })
const emit = defineEmits<{ saved: [] }>()
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
const busy = ref(false), msg = ref('')
const pick = ref(props.fit.level ?? '')
watch(() => props.fit.level, (v) => { pick.value = v ?? '' })
async function saveStaff() {
  busy.value = true; msg.value = ''
  try { await $fetch('/api/wm/clients/' + props.clientId, { method: 'POST', body: { action: 'risk', risk_profile: pick.value } }); emit('saved') } catch (e) { msg.value = err(e) } finally { busy.value = false }
}
// Client questionnaire.
const qz = reactive({ open: false, step: 0, answers: {} as Record<string, number>, result: '' })
function startQuiz() { if (props.preview) { msg.value = 'Preview only.'; return } Object.assign(qz, { open: true, step: 0, answers: {}, result: '' }) }
function answer(i: number) { const q = RISK_QUESTIONS[qz.step]!; qz.answers[q.id] = i + 1; if (qz.step < RISK_QUESTIONS.length - 1) qz.step++; else qz.result = levelFromAnswers(qz.answers) }
async function saveClient(level?: string) {
  busy.value = true; msg.value = ''
  try { await $fetch('/api/w/risk', { method: 'POST', body: level ? { level } : { answers: qz.answers } }); qz.open = false; emit('saved') } catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const total = computed(() => props.fit.by_rating.reduce((a, x) => a + x.value, 0))
const usd = (v: number) => '$' + (v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : Math.round(v).toLocaleString('en-US'))
const SHADE = ['#c9d8ec', '#9fbbe0', '#6d97cc', '#3d6fae', '#1b3f73']
</script>
<template>
  <div class="card rk">
    <div class="rh"><div><h3>Risk level</h3>
      <p class="mut">{{ fit.level ? levelLabel(fit.level) + (setBy ? ' · set by ' + (setBy === 'client' ? (mode === 'client' ? 'you' : 'the client') : (mode === 'client' ? 'your adviser' : 'adviser')) : '') + (setAt ? ' on ' + new Date(setAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '') : (mode === 'client' ? 'Tell us how much risk you are comfortable with, so we only suggest what suits you.' : 'Not set. The client can set it on their portal, or choose it here.') }}</p></div>
      <div v-if="mode === 'staff'" class="ra"><select v-model="pick" aria-label="Risk level"><option value="">Not set</option><option v-for="l in RISK_LEVELS" :key="l.code" :value="l.code">{{ l.label }}</option></select><button class="btn secondary sm" :disabled="busy || pick === (fit.level ?? '')" @click="saveStaff">Save</button></div>
      <button v-else class="btn sm" :class="{ secondary: !!fit.level }" @click="startQuiz">{{ fit.level ? 'Change' : 'Set my risk level' }}</button></div>
    <template v-if="fit.level">
      <p class="lim">{{ RISK_LEVELS.find((l) => l.code === fit.level)?.text }} Up to <b>{{ RATING_LABEL[fit.max_rating ?? 0]?.toLowerCase() }}</b> risk assets, with at most <b>{{ fit.max_high_pct }}%</b> in high-risk ones.</p>
      <div v-if="total" class="bar" role="img" :aria-label="'Holdings by risk: ' + fit.by_rating.map((r) => r.label + ' ' + usd(r.value)).join(', ')"><i v-for="r in fit.by_rating" :key="r.rating" :style="{ width: (r.value / total) * 100 + '%', background: SHADE[r.rating - 1] }" /></div>
      <div v-if="total" class="lg"><span v-for="r in fit.by_rating" :key="r.rating"><i :style="{ background: SHADE[r.rating - 1] }" />{{ r.label }} {{ usd(r.value) }}</span></div>
      <p class="st" :class="{ warn: !fit.ok && total }">{{ !total ? 'No holdings yet.' : fit.ok ? 'Holdings fit this level. High-risk assets are ' + fit.high_pct + '% of the total.' : (fit.over_high ? 'High-risk assets are ' + fit.high_pct + '%, above the ' + fit.max_high_pct + '% limit. ' : '') + (fit.over.length ? fit.over.length + ' holding' + (fit.over.length === 1 ? ' is' : 's are') + ' riskier than this level' + (mode === 'client' ? '; your adviser will review them with you.' : ':') : '') }}</p>
      <ul v-if="mode === 'staff' && fit.over.length" class="ov"><li v-for="o in fit.over" :key="o.name + o.category"><span>{{ o.name }}</span><em>{{ RATING_LABEL[o.rating] }} · {{ usd(o.value) }}</em></li></ul>
    </template>
    <p v-if="msg" class="error">{{ msg }}</p>
    <AppModal :open="qz.open" title="Your risk level" @close="qz.open = false">
      <div v-if="!qz.result" class="qz"><span class="mut">Question {{ qz.step + 1 }} of {{ RISK_QUESTIONS.length }}</span><b>{{ RISK_QUESTIONS[qz.step]!.q }}</b>
        <button v-for="(a, i) in RISK_QUESTIONS[qz.step]!.a" :key="a" class="opt" :class="{ on: qz.answers[RISK_QUESTIONS[qz.step]!.id] === i + 1 }" @click="answer(i)">{{ a }}</button>
        <button v-if="qz.step" class="lk" @click="qz.step--">← Back</button></div>
      <div v-else class="qz"><span class="mut">Your answers suggest</span><b class="res">{{ levelLabel(qz.result) }}</b><p>{{ RISK_LEVELS.find((l) => l.code === qz.result)?.text }}</p>
        <span class="mut">Or choose a level yourself:</span><div class="lv"><button v-for="l in RISK_LEVELS" :key="l.code" class="opt sm" :class="{ on: qz.result === l.code }" @click="qz.result = l.code">{{ l.label }}</button></div><p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button class="btn secondary" @click="qz.open = false">Cancel</button><button v-if="qz.result" class="btn" :disabled="busy" @click="saveClient(qz.result)">Save {{ levelLabel(qz.result) }}</button></template>
    </AppModal>
  </div>
</template>
<style scoped>
.rk { display: flex; flex-direction: column; gap: 10px; } .rh { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; } .rh h3 { margin: 0 0 2px; } .mut { font-size: 13px; color: var(--c-muted); margin: 0; }
.ra { display: flex; gap: 8px; } .ra select { font: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); background: #fff; }
.lim { font-size: 13.5px; color: var(--c-ink-soft); margin: 0; } .lim b { font-weight: 500; color: var(--c-ink); }
.bar { display: flex; height: 10px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; }
.lg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--c-ink-soft); } .lg i { display: inline-block; width: 9px; height: 9px; margin-right: 6px; vertical-align: middle; }
.st { font-size: 13.5px; margin: 0; } .st.warn { color: var(--c-warn); } .error { color: var(--c-danger); font-size: 13px; margin: 0; }
.ov { list-style: none; margin: 0; padding: 0; } .ov li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .ov em { font-style: normal; color: var(--c-muted); font-size: 12.5px; }
.qz { display: flex; flex-direction: column; gap: 8px; } .qz b { font-size: 16px; font-weight: 500; margin-bottom: 4px; } .qz .res { font-size: 22px; }
.opt { text-align: left; background: #fff; border: 1px solid var(--c-rule-strong); padding: 10px 12px; font: inherit; font-size: 14px; cursor: pointer; } .opt:hover, .opt.on { border-color: var(--c-navy); background: var(--c-signal-soft); } .opt.sm { padding: 6px 10px; font-size: 13px; }
.lv { display: flex; flex-wrap: wrap; gap: 6px; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; align-self: flex-start; }
</style>
