<script setup lang="ts">
// Design a sales or marketing process: the stages in order (open, won or lost), the conversion each should reach, the
// days it usually takes and the steps that move a deal or lead on; the monthly target; for marketing, the channels with
// a monthly budget and the bank vendors whose payments are that channel's spend.
import type { Process, Stage, Channel } from '~/shared/growth'
const props = defineProps<{ process: Process; kind: 'sales' | 'marketing'; vendors?: { vendor_key: string; vendor: string }[]; canEdit: boolean }>()
const emit = defineEmits<{ saved: []; deleted: [] }>()
type S = Stage & { stepsText: string }
const name = ref(''), target = ref<number | ''>(''), tkind = ref<Process['target_kind']>('revenue'), stages = ref<S[]>([]), channels = ref<Channel[]>([])
function load() {
  name.value = props.process.name; target.value = props.process.target_monthly ?? ''; tkind.value = props.process.target_kind
  stages.value = props.process.stages.map((s) => ({ ...s, stepsText: s.steps.join('\n') })); channels.value = structuredClone(toRaw(props.process.channels))
}
watch(() => props.process, load, { immediate: true })
const move = (i: number, d: number) => { const a = stages.value, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j]!, a[i]!] }
const addStage = () => { const i = stages.value.findIndex((s) => s.kind !== 'open'); stages.value.splice(i < 0 ? stages.value.length : i, 0, { key: '', name: 'New stage', kind: 'open', target_pct: 50, days: 7, steps: [], stepsText: '' }) }
const addChannel = () => channels.value.push({ key: '', name: 'New channel', monthly_budget: null, vendor_keys: [] })
const busy = ref(false), msg = ref(''), ok = ref('')
// Build with AI: from how the founder describes the business, a full set of stages (and channels for marketing) to
// review here; nothing is saved until Save process.
const ai = reactive({ open: false, text: '', budget: '' as number | '', busy: false, note: '' })
async function aiBuild() {
  ai.busy = true; msg.value = ''
  try {
    const r = await $fetch<{ name?: string; stages: Stage[]; channels?: { name: string; monthly_budget: number | null; why: string }[]; target_note?: string; note?: string }>('/api/growth/ai', { method: 'POST', body: { task: props.kind + '_process', description: ai.text, budget: ai.budget || undefined } })
    stages.value = r.stages.map((s) => ({ ...s, key: '', steps: s.steps, stepsText: s.steps.join('\n') }))
    if (props.kind === 'marketing' && r.channels) channels.value = r.channels.map((c) => ({ key: '', name: c.name, monthly_budget: c.monthly_budget, vendor_keys: [] }))
    ai.note = (r.target_note ?? r.note ?? '') + (r.channels ? ' ' + r.channels.map((c) => c.name + ': ' + c.why).join(' ') : ''); ai.open = false; ok.value = 'Drafted with AI. Review it, then Save process.'
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'AI could not do that just now.' } finally { ai.busy = false }
}
async function save() {
  busy.value = true; msg.value = ''; ok.value = ''
  try {
    await $fetch('/api/' + props.kind + '/process', { method: 'POST', body: { id: props.process.id, name: name.value, target_monthly: target.value === '' ? null : target.value, target_kind: tkind.value,
      stages: stages.value.map(({ stepsText, ...s }) => ({ ...s, key: s.key || undefined, target_pct: s.kind === 'open' && s.target_pct !== null && (s.target_pct as unknown) !== '' ? s.target_pct : null, days: s.kind === 'open' && s.days !== null && (s.days as unknown) !== '' ? s.days : null, steps: stepsText.split('\n').map((x) => x.trim()).filter(Boolean) })),
      channels: props.kind === 'marketing' ? channels.value.map((c) => ({ ...c, key: c.key || undefined, monthly_budget: (c.monthly_budget as unknown) === '' ? null : c.monthly_budget })) : undefined } })
    ok.value = 'Saved.'; emit('saved')
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
async function del() {
  if (!await askConfirm('Delete the process "' + props.process.name + '"' + (props.kind === 'sales' ? ' and its deals' : ', its campaigns and results') + '?')) return
  try { await $fetch('/api/' + props.kind + '/process', { method: 'POST', body: { id: props.process.id, delete: true } }); emit('deleted') } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not delete.' }
}
const overall = computed(() => stages.value.filter((s) => s.kind === 'open').reduce((t, s) => t * ((Number(s.target_pct) || 0) / 100), 1))
const cycle = computed(() => stages.value.filter((s) => s.kind === 'open').reduce((t, s) => t + (Number(s.days) || 0), 0))
</script>
<template>
  <div class="pe">
    <div class="card"><div class="g3"><label>Process name<input v-model="name" maxlength="80" :disabled="!canEdit"></label>
      <label>Monthly target ({{ process.currency }} or number)<input v-model.number="target" type="number" min="0" :disabled="!canEdit"></label>
      <label>Target is<select v-model="tkind" :disabled="!canEdit"><option v-if="kind === 'sales'" value="revenue">New revenue won</option><option v-if="kind === 'sales'" value="deals">Deals won</option><option v-if="kind === 'marketing'" value="leads">Leads</option><option value="customers">New customers</option></select></label></div>
      <p class="mut">{{ Math.round(overall * 1000) / 10 }}% end {{ kind === 'sales' ? 'won' : 'as customers' }}{{ cycle ? ' in about ' + cycle + ' days' : '' }}.</p></div>
    <div v-if="canEdit" class="card aib"><div class="ch"><h2><AiSpark /> Build it with AI</h2><button class="lk" @click="ai.open = !ai.open">{{ ai.open ? 'Close' : 'Describe your ' + (kind === 'sales' ? 'sales' : 'marketing') }}</button></div>
      <p v-if="!ai.open && !ai.note" class="mut">AI drafts the stages{{ kind === 'marketing' ? ' and channels' : '' }} for you to adjust.</p>
      <p v-if="ai.note && !ai.open" class="mut">{{ ai.note }}</p>
      <div v-if="ai.open" class="aif"><textarea v-model="ai.text" rows="4" maxlength="3000" :placeholder="kind === 'sales' ? 'e.g. We sell an SMS and voice API to banks and fintechs in Nigeria. Leads come from referrals and outbound; a technical demo, then a pilot, then a contract with procurement…' : 'e.g. Founders of seed-stage startups in Lagos and Nairobi. We get sign-ups from LinkedIn, events and partners…'" /><div class="row"><label v-if="kind === 'marketing'" class="sm">Monthly budget<input v-model.number="ai.budget" type="number" min="0"></label><button class="btn" :disabled="ai.busy" @click="aiBuild"><AiSpark v-if="ai.busy" /> {{ ai.busy ? 'Drafting…' : 'Draft with AI' }}</button><span class="mut">Replaces the stages below until you save.</span></div></div></div>
    <div class="card"><div class="ch"><h2>Stages</h2><button v-if="canEdit" class="lk" @click="addStage">+ Add a stage</button></div>
      <div v-for="(s, i) in stages" :key="i" class="st" :class="s.kind">
        <div class="sr"><span class="no">{{ i + 1 }}</span><input v-model="s.name" maxlength="60" aria-label="Stage name" :disabled="!canEdit">
          <select v-model="s.kind" aria-label="Kind" :disabled="!canEdit"><option value="open">In progress</option><option value="won">{{ kind === 'sales' ? 'Won' : 'Customer' }}</option><option value="lost">{{ kind === 'sales' ? 'Lost' : 'Dropped' }}</option></select>
          <template v-if="s.kind === 'open'"><label class="sm">Moves on<input v-model.number="s.target_pct" type="number" min="0" max="100" aria-label="Target conversion %" :disabled="!canEdit"><em>%</em></label><label class="sm">Takes<input v-model.number="s.days" type="number" min="0" aria-label="Days" :disabled="!canEdit"><em>days</em></label></template><span v-else class="sp" />
          <span v-if="canEdit" class="ar"><button class="lk" :disabled="!i" aria-label="Up" @click="move(i, -1)">↑</button><button class="lk" :disabled="i === stages.length - 1" aria-label="Down" @click="move(i, 1)">↓</button><button class="lk red" aria-label="Remove" @click="stages.splice(i, 1)">×</button></span></div>
        <label class="steps">Steps that move it on (one a line)<textarea v-model="s.stepsText" :rows="Math.max(2, s.stepsText.split('\n').length)" :disabled="!canEdit" placeholder="e.g. Book a discovery call" /></label>
      </div></div>
    <div v-if="kind === 'marketing'" class="card"><div class="ch"><h2>Channels</h2><button v-if="canEdit" class="lk" @click="addChannel">+ Add a channel</button></div>
      <div v-for="(c, i) in channels" :key="i" class="chn"><input v-model="c.name" maxlength="60" aria-label="Channel name" :disabled="!canEdit"><label class="sm">Budget a month<input v-model.number="c.monthly_budget" type="number" min="0" :disabled="!canEdit"></label>
        <label class="vk">Spend from these bank vendors<select v-model="c.vendor_keys" multiple :disabled="!canEdit || !vendors?.length" size="3"><option v-for="v in vendors ?? []" :key="v.vendor_key" :value="v.vendor_key">{{ v.vendor }}</option></select></label>
        <button v-if="canEdit" class="lk red" aria-label="Remove" @click="channels.splice(i, 1)">×</button></div>
      <p class="mut">{{ vendors?.length ? 'Payments to the vendors picked count as channel spend.' : 'Add bank transactions in Banking to track channel spend.' }}</p></div>
    <div v-if="canEdit" class="row"><button class="btn" :disabled="busy" @click="save">{{ busy ? 'Saving…' : 'Save process' }}</button><span v-if="ok" class="ok">{{ ok }}</span><span v-if="msg" class="error">{{ msg }}</span><span class="sp" /><button class="lk red" @click="del">Delete this process</button></div>
  </div>
</template>
<style scoped>
.pe { display: flex; flex-direction: column; gap: 16px; } .card h2 { margin: 0; font-size: 16px; } .ch { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.g3 { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 12px; margin-bottom: 10px; } label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--c-ink-soft); }
input, select, textarea { font: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; }
.mut { margin: 0; font-size: 12.5px; color: var(--c-muted); }
.st { border-top: 1px solid var(--c-rule); padding: 10px 0; } .st.won .no { background: var(--c-navy); color: #fff; } .st.lost .no { background: #eef0f4; }
.sr { display: grid; grid-template-columns: 26px minmax(0, 1.4fr) 130px 160px 140px auto; gap: 8px; align-items: center; } .sr .sp { grid-column: span 2; }
.no { width: 24px; height: 24px; display: grid; place-items: center; font-size: 12px; background: #f1f3f7; color: var(--c-ink-soft); }
.sm { flex-direction: row; align-items: center; gap: 6px; white-space: nowrap; } .sm input { width: 64px; } .sm em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.ar { display: flex; gap: 10px; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); } .lk:disabled { color: var(--c-muted); }
.steps { margin: 8px 0 0 34px; } .chn { display: grid; grid-template-columns: minmax(0, 1fr) 190px minmax(0, 1.3fr) auto; gap: 10px; align-items: center; border-top: 1px solid var(--c-rule); padding: 10px 0; } .chn .sm input { width: 90px; }
.vk select { min-height: 58px; } .row { display: flex; gap: 12px; align-items: center; } .row .sp { flex: 1; } .ok { color: var(--c-blue-deep); font-size: 13px; }
@media (max-width: 860px) { .g3, .sr, .chn { grid-template-columns: 1fr; } .steps { margin-left: 0; } }
.aib h2 { display: flex; gap: 6px; align-items: center; } .aif { display: flex; flex-direction: column; gap: 10px; } .aif textarea { width: 100%; }
</style>
