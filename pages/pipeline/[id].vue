<script setup lang="ts">
const id = useRoute().params.id as string
interface Ev { id: string; kind: string; body: string | null; meeting_at: string | null; from_stage: string | null; to_stage: string | null; created_at: string; by_name: string | null; document_id: string | null; document_title: string | null }
interface Vote { vote: string; note: string | null; voted_at: string; voter: string; mine: boolean }
interface Deal { id: string; company: string; one_liner: string | null; website: string | null; stage: string; round: string | null; raise_usd: string | null; check_usd: string | null; valuation_usd: string | null; source: string; owner_id: string | null; owner_name: string | null; pitch_id: string | null; stage_since: string }
const { data, error, refresh } = await useFetch<{ deal: Deal; events: Ev[]; votes: Vote[]; tally: { approvals: number; rejections: number }; required: number; canVote: boolean }>('/api/pipeline/' + id)
const { data: people } = await useFetch<{ id: string; name: string }[]>('/api/pipeline/people')
const { data: docs } = await useFetch<{ id: string; title: string }[]>('/api/documents')
useHead({ title: () => (data.value?.deal.company ?? 'Deal') + ' — Aidi OS' })
const STAGES = [
  { v: 'screening', label: 'Screening' }, { v: 'first_call', label: 'First call' }, { v: 'diligence', label: 'Diligence' },
  { v: 'ic', label: 'IC' }, { v: 'invested', label: 'Invested' }, { v: 'passed', label: 'Passed' }
]
const ROUND: Record<string, string> = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', later: 'Later' }
const stageLabel = (s: string | null) => STAGES.find((x) => x.v === s)?.label ?? s ?? ''
const busy = ref(false)
const msg = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function run(fn: () => Promise<unknown>) { busy.value = true; msg.value = ''; try { await fn(); await refresh() } catch (e) { msg.value = errText(e) } finally { busy.value = false } }

const move = (stage: string) => {
  let note: string | undefined
  if (stage === 'passed') { const r = prompt('Why are we passing? (required)'); if (!r) return; note = r }
  return run(() => $fetch('/api/pipeline/' + id + '/stage', { method: 'POST', body: { stage, note } }))
}
const fields = reactive({ owner_id: '', round: '', raise_usd: '', check_usd: '', valuation_usd: '' })
watchEffect(() => {
  const d = data.value?.deal; if (!d) return
  fields.owner_id = d.owner_id ?? ''; fields.round = d.round ?? ''; fields.raise_usd = d.raise_usd ?? ''; fields.check_usd = d.check_usd ?? ''; fields.valuation_usd = d.valuation_usd ?? ''
})
const num = (v: string) => (v.replace(/[^0-9]/g, '') ? Number(v.replace(/[^0-9]/g, '')) : null)
const save = () => run(() => $fetch('/api/pipeline/' + id, { method: 'PATCH', body: { owner_id: fields.owner_id || null, round: fields.round || null, raise_usd: num(String(fields.raise_usd)), check_usd: num(String(fields.check_usd)), valuation_usd: num(String(fields.valuation_usd)) } }))

const ev = reactive({ kind: 'note' as 'note' | 'meeting' | 'document', body: '', meeting_at: '', document_id: '' })
const addEvent = () => run(async () => {
  const body = ev.kind === 'document' ? { kind: 'document', document_id: ev.document_id, body: ev.body || undefined }
    : ev.kind === 'meeting' ? { kind: 'meeting', body: ev.body, meeting_at: ev.meeting_at } : { kind: 'note', body: ev.body }
  await $fetch('/api/pipeline/' + id + '/events', { method: 'POST', body })
  ev.body = ''; ev.meeting_at = ''; ev.document_id = ''
})
const voteNote = ref('')
const vote = (v: 'approve' | 'reject') => run(async () => { await $fetch('/api/pipeline/' + id + '/vote', { method: 'POST', body: { vote: v, note: voteNote.value || undefined } }); voteNote.value = '' })
async function openDoc(docId: string) {
  try { const r = await $fetch<{ url: string }>('/api/documents/' + docId + '/download'); window.location.href = r.url } catch (e) { msg.value = errText(e) }
}
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/pipeline" class="back">← Pipeline</NuxtLink>
    <p class="label">{{ data.deal.round ? ROUND[data.deal.round] : 'Round not set' }} · {{ data.deal.source.replace('_', ' ') }}<template v-if="data.deal.pitch_id"> · <NuxtLink :to="'/deals/' + data.deal.pitch_id">original pitch</NuxtLink></template></p>
    <h1>{{ data.deal.company }}</h1>
    <p class="lead">{{ data.deal.one_liner }}</p>

    <div class="stages" role="group" aria-label="Stage">
      <button v-for="s in STAGES" :key="s.v" type="button" :class="{ on: data.deal.stage === s.v, passed: s.v === 'passed' }" :disabled="busy || data.deal.stage === s.v" @click="move(s.v)">{{ s.label }}</button>
    </div>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p>

    <div class="grid">
      <div class="col">
        <div v-if="data.deal.stage === 'ic' || data.votes.length" class="card ic">
          <h2>Investment committee</h2>
          <p class="tally"><b>{{ data.tally.approvals }}</b> of {{ data.required }} GP approvals<template v-if="data.tally.rejections"> · <span class="rej">{{ data.tally.rejections }} rejection</span></template></p>
          <ul v-if="data.votes.length" class="votes"><li v-for="v in data.votes" :key="v.voter"><b :class="v.vote">{{ v.vote === 'approve' ? 'Approve' : 'Reject' }}</b> · {{ v.voter }}<span v-if="v.note">{{ v.note }}</span></li></ul>
          <template v-if="data.canVote && data.deal.stage === 'ic'">
            <textarea v-model="voteNote" rows="2" placeholder="Note (optional)" />
            <div class="row"><button class="btn" type="button" :disabled="busy" @click="vote('approve')">Approve</button><button class="btn secondary" type="button" :disabled="busy" @click="vote('reject')">Reject</button></div>
          </template>
          <p v-else-if="data.deal.stage === 'ic'" class="muted">Only GPs vote. Invested unlocks at {{ data.required }} approvals with no rejection.</p>
        </div>

        <div class="card">
          <h2>Timeline</h2>
          <form class="ev" @submit.prevent="addEvent">
            <div class="tabs"><button v-for="k in (['note', 'meeting', 'document'] as const)" :key="k" type="button" :class="{ on: ev.kind === k }" @click="ev.kind = k">{{ k === 'note' ? 'Note' : k === 'meeting' ? 'Meeting' : 'Document' }}</button></div>
            <input v-if="ev.kind === 'meeting'" v-model="ev.meeting_at" type="datetime-local" required aria-label="Meeting date and time">
            <select v-if="ev.kind === 'document'" v-model="ev.document_id" required aria-label="Document"><option value="" disabled>Choose a document from Documents</option><option v-for="d in docs ?? []" :key="d.id" :value="d.id">{{ d.title }}</option></select>
            <textarea v-model="ev.body" rows="3" :required="ev.kind !== 'document'" :placeholder="ev.kind === 'meeting' ? 'Who, and what was discussed' : ev.kind === 'document' ? 'Why it matters (optional)' : 'Add a note'" />
            <button class="btn" type="submit" :disabled="busy">Add</button>
          </form>
          <ul class="tl">
            <li v-for="e in data.events" :key="e.id" :data-kind="e.kind">
              <p class="tl-head">
                <template v-if="e.kind === 'stage'">Moved {{ stageLabel(e.from_stage) }} → <b>{{ stageLabel(e.to_stage) }}</b></template>
                <template v-else-if="e.kind === 'meeting'">Meeting · {{ e.meeting_at ? when(e.meeting_at) : '' }}</template>
                <template v-else-if="e.kind === 'document'">Document · <button v-if="e.document_id" type="button" class="link" @click="openDoc(e.document_id)">{{ e.document_title }}</button><span v-else>{{ e.document_title }}</span></template>
                <template v-else-if="e.kind === 'ic_vote'">IC vote</template>
                <template v-else>Note</template>
              </p>
              <p v-if="e.body" class="tl-body">{{ e.body }}</p>
              <p class="tl-meta">{{ e.by_name ?? 'System' }} · {{ when(e.created_at) }}</p>
            </li>
          </ul>
          <p v-if="!data.events.length" class="muted">Nothing yet.</p>
        </div>
      </div>

      <div class="col">
        <form class="card facts" @submit.prevent="save">
          <h2>Details</h2>
          <label class="label">Owner<select v-model="fields.owner_id"><option value="">No owner</option><option v-for="p in people ?? []" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
          <label class="label">Round<select v-model="fields.round"><option value="">—</option><option v-for="(l, k) in ROUND" :key="k" :value="k">{{ l }}</option></select></label>
          <label class="label">Raising (USD)<input v-model="fields.raise_usd" inputmode="numeric"></label>
          <label class="label">Our check (USD)<input v-model="fields.check_usd" inputmode="numeric"></label>
          <label class="label">Post-money valuation (USD)<input v-model="fields.valuation_usd" inputmode="numeric"></label>
          <button class="btn" type="submit" :disabled="busy">Save</button>
          <p class="muted small">In {{ stageLabel(data.deal.stage) }} since {{ when(data.deal.stage_since) }}</p>
        </form>
      </div>
    </div>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Deal not found.' : 'Could not load this deal.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
.lead { color: var(--c-muted); margin: 8px 0 20px; }
.stages { display: flex; flex-wrap: wrap; gap: 0; margin-bottom: 20px; border: 1px solid var(--c-rule-strong); width: fit-content; background: #fff; }
.stages button { font: inherit; font-size: 13px; padding: 9px 16px; background: #fff; border: 0; border-right: 1px solid var(--c-rule); cursor: pointer; color: var(--c-ink-soft); }
.stages button:last-child { border-right: 0; }
.stages button.on { background: var(--c-navy); color: #fff; }
.stages button.passed:not(.on) { color: var(--c-muted); }
.stages button:disabled { cursor: default; }
.grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
h2 { margin-bottom: 12px; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; }
textarea { resize: vertical; }
.facts { display: flex; flex-direction: column; gap: 12px; } .facts label { display: flex; flex-direction: column; gap: 6px; }
.ev { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; } .ev .btn { align-self: flex-start; }
.tabs button { font: inherit; background: none; border: 0; border-bottom: 2px solid transparent; padding: 4px 2px; margin-right: 14px; cursor: pointer; color: var(--c-muted); }
.tabs button.on { color: var(--c-navy); border-bottom-color: var(--c-navy); }
.tl { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--c-rule); }
.tl li { padding: 12px 0 12px 14px; border-bottom: 1px solid var(--c-rule); border-left: 2px solid var(--c-rule); margin-left: 2px; }
.tl li[data-kind="stage"] { border-left-color: var(--c-navy); } .tl li[data-kind="ic_vote"] { border-left-color: var(--c-blue); } .tl li[data-kind="meeting"] { border-left-color: var(--c-cyan); }
.tl-head { margin: 0; font-weight: 500; color: var(--c-navy); } .tl-body { margin: 4px 0 0; white-space: pre-wrap; } .tl-meta { margin: 4px 0 0; font-size: 12px; color: var(--c-muted); }
.ic .tally { margin: 0 0 10px; } .rej { color: var(--c-danger); }
.votes { list-style: none; padding: 0; margin: 0 0 12px; } .votes li { padding: 6px 0; border-bottom: 1px solid var(--c-rule); } .votes span { display: block; color: var(--c-muted); font-size: 13px; }
.votes b.approve { color: var(--c-ok); } .votes b.reject { color: var(--c-danger); }
.row { display: flex; gap: 10px; margin-top: 10px; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.muted { color: var(--c-muted); } .small { font-size: 12px; margin: 0; } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
