<script setup lang="ts">
const id = useRoute().params.id as string
interface D { job: { id: string; title: string; status: string; due_date: string | null; company: string | null }; events: { id: string; kind: string; body: string | null; to_status: string | null; created_at: string; from_client: boolean; document_id: string | null; document: string | null }[] }
const { data, refresh } = await usePortalFetch<D>('/api/portal/jobs/' + id)
useHead({ title: () => data.value?.job.title ?? 'Request' })
const ST: Record<string, string> = { new: 'Received', in_progress: 'In progress', waiting_client: 'Waiting on you', completed: 'Completed', cancelled: 'Cancelled' }
const text = ref(''); const note = ref(''); const msg = ref(''); const ok = ref(''); const busy = ref(false)
async function send() { busy.value = true; msg.value = ''; try { await $fetch('/api/portal/jobs/' + id + '/message', { method: 'POST', body: { body: text.value } }); text.value = ''; ok.value = 'Sent.'; await refresh() } catch (e) { msg.value = portalErr(e) } finally { busy.value = false } }
async function upload(ev: Event) {
  const input = ev.target as HTMLInputElement
  for (const f of Array.from(input.files ?? [])) { busy.value = true; msg.value = ''; const fd = new FormData(); fd.append('file', f); fd.append('note', note.value); try { await $fetch('/api/portal/jobs/' + id + '/upload', { method: 'POST', body: fd }); ok.value = 'Uploaded ' + f.name + '.' } catch (e) { msg.value = f.name + ': ' + portalErr(e) } }
  busy.value = false; input.value = ''; note.value = ''; await refresh()
}
async function openDoc(docId: string) { try { const r = await $fetch<{ url: string }>('/api/portal/documents/' + docId); window.location.href = r.url } catch (e) { msg.value = portalErr(e) } }
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const label = (e: D['events'][number]) => e.kind === 'status' ? 'Status: ' + (ST[e.to_status ?? ''] ?? e.to_status) : e.kind === 'document' ? 'Document shared with you' : e.kind === 'client_document' ? 'You uploaded a document' : e.from_client ? 'You wrote' : 'Message from our team'
</script>

<template>
  <section v-if="data">
    <ServiceNotice compact />
    <NuxtLink to="/client" class="back">← Home</NuxtLink>
    <div class="hd"><div><h1>{{ data.job.title }}</h1><p class="mut">{{ data.job.company }}{{ data.job.due_date ? ' · due ' + data.job.due_date : '' }}</p></div><span class="tag" :class="data.job.status">{{ ST[data.job.status] }}</span></div>
    <IntakeForm :job-id="data.job.id" />
    <p v-if="data.job.status === 'waiting_client'" class="card need">We are waiting on you. Please read the latest message below and upload what is needed.</p>
    <div class="grid">
      <div class="card tl"><h2>Updates</h2>
        <div v-for="e in data.events" :key="e.id" class="ev" :class="{ me: e.from_client }"><span class="w">{{ label(e) }} · {{ when(e.created_at) }}</span>
          <p v-if="e.body" class="b">{{ e.body }}</p><button v-if="e.document_id" type="button" class="doc" @click="openDoc(e.document_id)">{{ e.document?.split(' — ').pop() }} · Download</button></div>
        <p v-if="!data.events.length" class="mut">No updates yet.</p></div>
      <div class="side">
        <div class="card"><h2>Send documents</h2><label class="label">What are they? (optional)<input v-model="note" maxlength="1000" placeholder="e.g. 2025 bank statements"></label>
          <DropZone multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xlsx,.xls,.docx" :disabled="busy" :label="busy ? 'Uploading…' : ''" @change="upload" /></div>
        <form class="card" @submit.prevent="send"><h2>Message us about this</h2><textarea v-model="text" rows="4" maxlength="5000" required /><button class="btn" type="submit" :disabled="busy || !text.trim()">Send</button></form>
        <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 12px; color: var(--c-muted); } .hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; } h1 { margin: 0; } .mut { color: var(--c-muted); font-size: 14px; }
.need { border-left: 3px solid var(--c-warn); margin: 14px 0 0; } .grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; margin-top: 16px; align-items: start; } h2 { font-size: 19px; margin: 0 0 10px; }
.ev { padding: 12px 0; border-bottom: 1px solid var(--c-rule); } .ev.me { padding-left: 12px; border-left: 3px solid var(--c-signal-soft); } .w { font-size: 12.5px; color: var(--c-muted); } .b { margin: 6px 0 0; white-space: pre-wrap; font-size: 14.5px; }
.doc { margin-top: 8px; background: var(--c-paper-2); border: 0; padding: 7px 10px; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.side { display: flex; flex-direction: column; gap: 14px; } .side form, .side .card { display: flex; flex-direction: column; gap: 10px; } label.label { display: flex; flex-direction: column; gap: 6px; }
input, textarea { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); } .up { position: relative; overflow: hidden; align-self: flex-start; } .up input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.tag { font-size: 13px; padding: 4px 10px; background: var(--c-paper-2); } .tag.completed { color: var(--c-ok); background: rgba(31,122,77,.1); } .tag.waiting_client { color: var(--c-warn); background: rgba(183,121,31,.1); }
.ok { color: var(--c-ok); margin: 0; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
</style>
