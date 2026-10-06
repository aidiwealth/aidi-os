<script setup lang="ts">
const id = useRoute().params.id as string
interface Job { codes?: string[]; id: string; title: string; service: string; description: string | null; status: string; priority: string; due_date: string | null; fee_usd: string | null; owner_id: string | null; company_id: string | null; created_at: string; link_active: boolean | null; client_token_expires: string | null; client_id: string; client: string; contact_name: string; email: string; phone: string | null; country: string | null }
interface Ev { id: string; kind: string; body: string | null; from_status: string | null; to_status: string | null; visible_to_client: boolean; created_at: string; by_name: string | null; document_id: string | null; document_title: string | null }
const { data, error, refresh } = await useFetch<{ job: Job; events: Ev[]; companies: { id: string; name: string }[] }>('/api/services/' + id)
const { data: people } = await useFetch<{ id: string; name: string }[]>('/api/pipeline/people')
const { data: docs } = await useFetch<{ id: string; title: string; sensitivity: string }[]>('/api/documents')
useHead({ title: () => (data.value?.job.title ?? 'Job') })
const SERVICES: Record<string, string> = { company_formation: 'Company formation', annual_compliance: 'Annual compliance', tax_filing: 'Tax filing', registered_agent: 'Registered agent', legal_review: 'Legal review', trust_setup: 'Trust set-up', banking_setup: 'Banking set-up', other: 'Other' }
const STATUSES = [['new', 'New'], ['in_progress', 'In progress'], ['waiting_client', 'Waiting on client'], ['completed', 'Completed'], ['cancelled', 'Cancelled']] as const
const label = (s: string | null) => STATUSES.find(([k]) => k === s)?.[1] ?? s ?? ''
const busy = ref(false)
const msg = ref('')
const ok = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function run(fn: () => Promise<unknown>) { busy.value = true; msg.value = ''; ok.value = ''; try { await fn(); await refresh() } catch (e) { msg.value = errText(e) } finally { busy.value = false } }

const tellClient = ref(true)
const setStatus = (s: string) => run(async () => {
  const note = s === 'waiting_client' ? prompt('What do you need from the client? (sent to them)') ?? '' : ''
  const r = await $fetch<{ emailed: boolean }>('/api/services/' + id + '/events', { method: 'POST', body: { kind: 'status', status: s, body: note || undefined, visible_to_client: tellClient.value } })
  if (tellClient.value) ok.value = r.emailed ? 'Client emailed.' : 'Status changed; the client email did not send.'
})
const ev = reactive({ kind: 'message' as 'message' | 'note' | 'document', body: '', document_id: '', share: true })
const addEvent = () => run(async () => {
  const body = ev.kind === 'document' ? { kind: 'document', document_id: ev.document_id, body: ev.body || undefined, visible_to_client: ev.share } : { kind: ev.kind, body: ev.body }
  const r = await $fetch<{ emailed: boolean }>('/api/services/' + id + '/events', { method: 'POST', body })
  if (ev.kind === 'message' || (ev.kind === 'document' && ev.share)) ok.value = r.emailed ? 'Sent to the client.' : 'Saved; the client email did not send.'
  ev.body = ''; ev.document_id = ''
})
const link = ref('')
const sendLink = () => run(async () => { const r = await $fetch<{ link: string; emailed: boolean }>('/api/services/' + id + '/link', { method: 'POST' }); link.value = r.link; ok.value = r.emailed ? 'Link emailed to ' + data.value?.job.email + '.' : 'Link created; copy it below.' })
const fields = reactive({ owner_id: '', company_id: '', priority: 'normal', due_date: '', fee_usd: '' })
watchEffect(() => { const j = data.value?.job; if (!j) return; fields.owner_id = j.owner_id ?? ''; fields.company_id = j.company_id ?? ''; fields.priority = j.priority; fields.due_date = j.due_date ?? ''; fields.fee_usd = j.fee_usd ?? '' })
const save = () => run(() => $fetch('/api/services/' + id, { method: 'PATCH', body: { owner_id: fields.owner_id || null, company_id: fields.company_id || null, priority: fields.priority, due_date: fields.due_date || null, fee_usd: fields.fee_usd ? Number(String(fields.fee_usd).replace(/[^0-9.]/g, '')) : null } }))
async function openDoc(docId: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + docId + '/download'); window.location.href = r.url } catch (e) { msg.value = errText(e) } }
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const KIND: Record<string, string> = { note: 'Internal note', message: 'Message to client', status: 'Status', document: 'Document', client_message: 'Client replied', client_document: 'Client uploaded' }
const linkify = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/(https?:\/\/[^\s<]+)/g, (u) => '<a href="' + u + '" target="_blank" rel="noopener">' + (u.length > 60 ? u.slice(0, 57) + '…' : u) + '</a>')
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/services" class="back">← Jobs</NuxtLink>
    <p class="label">{{ SERVICES[data.job.service] }} · {{ data.job.client }}</p>
    <div class="dh"><h1>{{ data.job.title }}</h1><DeleteButton type="job" :id="id" :name="data.job.title" to="/services" /></div>
    <RaiseBrief v-if="data.job.codes?.includes('fundraising')" :job-id="id" />
    <p v-else-if="data.job.description" class="lead desc" v-html="linkify(data.job.description)" />
    <IntakeView v-if="['company_formation', 'annual_compliance', 'tax_filing'].includes(data.job.service)" :job-id="id" />

    <div class="stages" role="group" aria-label="Status">
      <button v-for="[k, l] in STATUSES" :key="k" type="button" :class="{ on: data.job.status === k }" :disabled="busy || data.job.status === k" @click="setStatus(k)">{{ l }}</button>
    </div>
    <label class="tell"><input v-model="tellClient" type="checkbox"> Tell the client when the status changes</label>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p><p v-if="ok" class="ok" role="status">{{ ok }}</p>

    <div class="grid">
      <div class="card">
        <h2>Timeline</h2>
        <form class="ev" @submit.prevent="addEvent">
          <div class="tabs"><button v-for="k in (['message', 'note', 'document'] as const)" :key="k" type="button" :class="{ on: ev.kind === k }" @click="ev.kind = k">{{ k === 'message' ? 'Message client' : k === 'note' ? 'Internal note' : 'Share document' }}</button></div>
          <select v-if="ev.kind === 'document'" v-model="ev.document_id" required aria-label="Document"><option value="" disabled>Choose from Documents</option><option v-for="d in docs ?? []" :key="d.id" :value="d.id">{{ d.title }}{{ d.sensitivity !== 'normal' ? ' (' + d.sensitivity + ')' : '' }}</option></select>
          <label v-if="ev.kind === 'document'" class="chk"><input v-model="ev.share" type="checkbox"> Visible to the client (only Normal documents)</label>
          <textarea v-model="ev.body" rows="3" :required="ev.kind !== 'document'" :placeholder="ev.kind === 'message' ? 'The client sees this and gets an email' : ev.kind === 'note' ? 'Only the team sees this' : 'Note (optional)'" />
          <button class="btn" type="submit" :disabled="busy">{{ ev.kind === 'message' ? 'Send to client' : 'Add' }}</button>
        </form>
        <ul class="tl">
          <li v-for="e in data.events" :key="e.id" :data-kind="e.kind" :class="{ vis: e.visible_to_client }">
            <p class="h">{{ KIND[e.kind] }}<template v-if="e.kind === 'status'">: {{ label(e.from_status) }} → <b>{{ label(e.to_status) }}</b></template>
              <span v-if="e.visible_to_client" class="tag">Client sees this</span></p>
            <p v-if="e.document_title" class="b"><button v-if="e.document_id" type="button" class="link" @click="openDoc(e.document_id)">{{ e.document_title }}</button><span v-else>{{ e.document_title }}</span></p>
            <p v-if="e.body" class="b">{{ e.body }}</p>
            <p class="m">{{ e.by_name ?? (e.kind.startsWith('client') ? data.job.contact_name : 'System') }} · {{ when(e.created_at) }}</p>
          </li>
        </ul>
        <EmptyState v-if="!data.events.length" compact icon="services" title="Nothing yet" />
      </div>

      <div class="col">
        <div class="card">
          <h2>Client</h2>
          <p class="c"><b>{{ data.job.client }}</b><br>{{ data.job.contact_name }} · <a :href="'mailto:' + data.job.email">{{ data.job.email }}</a><template v-if="data.job.phone"><br>{{ data.job.phone }}</template><template v-if="data.job.country"> · {{ data.job.country }}</template></p>
          <button class="btn secondary" type="button" :disabled="busy" @click="sendLink">{{ data.job.link_active ? 'Re-send client link' : 'Send client link' }}</button>
          <p class="muted small">No login for the client. The link shows status and shared items, and lets them reply and upload documents. It works for 90 days.</p>
          <input v-if="link" :value="link" readonly class="linkbox" aria-label="Client link" @focus="($event.target as HTMLInputElement).select()">
        </div>
        <form class="card facts" @submit.prevent="save">
          <h2>Details</h2>
          <label class="label">Owner<select v-model="fields.owner_id"><option value="">No owner</option><option v-for="p in people ?? []" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
          <label class="label">Company<select v-model="fields.company_id"><option value="">—</option><option v-for="c in data.companies" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
          <label class="label">Priority<select v-model="fields.priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
          <label class="label">Due<input v-model="fields.due_date" type="date"></label>
          <label class="label">Fee (USD)<input v-model="fields.fee_usd" inputmode="decimal"></label>
          <button class="btn" type="submit" :disabled="busy">Save</button>
        </form>
      </div>
    </div>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Job not found.' : 'Could not load this job.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
.lead { color: var(--c-muted); margin: 8px 0 16px; white-space: pre-wrap; max-width: 75ch; }
.stages { display: flex; flex-wrap: wrap; margin: 12px 0 8px; border: 1px solid var(--c-rule-strong); width: fit-content; background: #fff; }
.stages button { font: inherit; font-size: 13px; padding: 9px 16px; background: #fff; border: 0; border-right: 1px solid var(--c-rule); cursor: pointer; color: var(--c-ink-soft); }
.stages button:last-child { border-right: 0; } .stages button.on { background: var(--c-navy); color: #fff; } .stages button:disabled { cursor: default; }
.tell { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--c-muted); margin-bottom: 16px; }
.grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 20px; } h2 { margin-bottom: 12px; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; }
textarea { resize: vertical; }
.ev { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; } .ev .btn { align-self: flex-start; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; } .chk input, .tell input { width: auto; }
.tabs button { font: inherit; background: none; border: 0; border-bottom: 2px solid transparent; padding: 4px 2px; margin-right: 14px; cursor: pointer; color: var(--c-muted); }
.tabs button.on { color: var(--c-navy); border-bottom-color: var(--c-navy); }
.tl { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--c-rule); }
.tl li { padding: 12px 0 12px 14px; border-bottom: 1px solid var(--c-rule); border-left: 2px solid var(--c-rule); margin-left: 2px; }
.tl li.vis { border-left-color: var(--c-blue); } .tl li[data-kind^="client"] { border-left-color: var(--c-cyan); background: #f5fafc; }
.h { margin: 0; font-weight: 500; color: var(--c-navy); } .b { margin: 4px 0 0; white-space: pre-wrap; } .m { margin: 4px 0 0; font-size: 12px; color: var(--c-muted); }
.tag { margin-left: 8px; font-size: 10.5px; font-weight: 500; color: var(--c-blue-deep); background: #eef4f9; padding: 1px 6px; }
.c { margin: 0 0 14px; line-height: 1.7; }
.facts { display: flex; flex-direction: column; gap: 12px; } .facts label { display: flex; flex-direction: column; gap: 6px; }
.linkbox { font-size: 12px; margin-top: 8px; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.muted { color: var(--c-muted); } .small { font-size: 12.5px; margin: 10px 0 0; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
.desc { white-space: pre-wrap; } .desc :deep(a) { color: var(--c-blue-deep); word-break: break-all; }
</style>
