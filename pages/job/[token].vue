<script setup lang="ts">
import { mdRender } from '~/shared/markdown'
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
interface Ev { id: string; kind: string; body: string | null; to_status: string | null; created_at: string; document_title: string | null; has_document: boolean }
interface Data { title: string; service: string; status: string; statusLabel: string; dueDate: string | null; client: string; contactName: string; events: Ev[]; workspace: { name: string; firm: string; brand: string } }
const { data, error, refresh } = await useFetch<Data>('/api/public/job/' + token, { key: 'pub-job-' + token })
useHead({ titleTemplate: '%s', title: () => (data.value?.title ?? 'Your request') + (data.value ? ' — ' + data.value.workspace.name : ''), meta: [{ name: 'robots', content: 'noindex' }] })
const LABEL: Record<string, string> = { new: 'Received', in_progress: 'In progress', waiting_client: 'Waiting on you', completed: 'Completed', cancelled: 'Cancelled' }
const STEPS = ['new', 'in_progress', 'completed']
const reply = ref('')
const state = reactive({ busy: false, msg: '', ok: '' })
const fileEl = ref<HTMLInputElement | null>(null)
const over = ref(false)
interface Ag { id: string; title: string; status: string; effective_date: string; signed_at: string | null; signer_name: string | null; body: string | null }
const { data: ags, refresh: rags } = await useFetch<Ag[]>('/api/public/job/' + token + '/agreements', { key: 'pub-job-ag-' + token, default: () => [] })
const signing = ref<Ag | null>(null); const sv = ref({ name: '', kind: 'typed' as 'typed' | 'drawn' | 'uploaded', png: '', agree: false }); const sBusy = ref(false); const sErr = ref('')
const sReady = computed(() => sv.value.name.trim().length > 1 && !!sv.value.png && sv.value.agree)
async function signAg() { if (!signing.value) return; sBusy.value = true; sErr.value = ''; try { await $fetch('/api/public/job/' + token + '/agreements/' + signing.value.id, { method: 'POST', body: sv.value }); signing.value = null; state.ok = 'Signed. A copy is in your email.'; await Promise.all([rags(), refresh()]) } catch (e) { sErr.value = errText(e) } finally { sBusy.value = false } }
async function openAg(aid: string) { const w = window.open('', '_blank'); try { const r = await $fetch<{ url: string }>('/api/public/job/' + token + '/agreements/' + aid); if (w) w.location.href = r.url } catch (e) { w?.close(); state.msg = errText(e) } }
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Please try again.' }
async function send() {
  state.busy = true; state.msg = ''; state.ok = ''
  try { await $fetch('/api/public/job/' + token + '/message', { method: 'POST', body: { body: reply.value } }); reply.value = ''; state.ok = 'Sent. Your contact has been notified.'; await refresh() }
  catch (e) { state.msg = errText(e) } finally { state.busy = false }
}
async function upload(f: File | undefined) {
  if (!f) return
  state.busy = true; state.msg = ''; state.ok = ''
  const fd = new FormData(); fd.append('file', f)
  try { await $fetch('/api/public/job/' + token + '/upload', { method: 'POST', body: fd }); state.ok = 'Uploaded ' + f.name + '.'; await refresh() }
  catch (e) { state.msg = errText(e) } finally { state.busy = false; if (fileEl.value) fileEl.value.value = '' }
}
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const WHAT: Record<string, string> = { status: 'Status update', message: 'Message from the team', document: 'Document shared with you', client_message: 'You wrote', client_document: 'You uploaded' }
const rich = (s: string) => mdRender(s.includes('\n\n') || /^\s*([-*]|\d+\.|#|>)\s/m.test(s) ? s : s.replace(/\n/g, '  \n'))
</script>

<template>
  <div class="wrap">
    <div v-if="error" class="card center">
      <h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1>
      <p>{{ error.statusCode === 410 ? 'Ask your contact for a new one.' : 'Check you opened the full link from the email.' }}</p>
    </div>
    <template v-else-if="data">
      <p class="label">{{ data.service }} · {{ data.client }}</p>
      <h1>{{ data.title }}</h1>
      <div class="status card" :data-s="data.status">
        <span class="label">Status</span><b>{{ LABEL[data.status] }}</b>
        <span v-if="data.dueDate && !['completed', 'cancelled'].includes(data.status)" class="due">Target date {{ new Date(data.dueDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) }}</span>
        <ol v-if="data.status !== 'cancelled'" class="steps"><li v-for="s in STEPS" :key="s" :class="{ done: STEPS.indexOf(data.status === 'waiting_client' ? 'in_progress' : data.status) >= STEPS.indexOf(s) }">{{ LABEL[s] }}</li></ol>
      </div>

      <div v-for="a in (ags ?? []).filter((x) => x.status === 'pending')" :key="a.id" class="card sign"><div><b>Please sign: {{ a.title }}</b><span>Effective {{ new Date(a.effective_date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }}. Our agreement for this request: service levels, fees and refunds.</span></div><button type="button" class="btn" @click="signing = a; sErr = ''">Review and sign</button></div>
      <div v-if="(ags ?? []).some((a) => a.status === 'signed')" class="card"><h2>Agreements</h2><p v-for="a in (ags ?? []).filter((x) => x.status === 'signed')" :key="a.id" class="b"><button type="button" class="lnk" @click="openAg(a.id)">{{ a.title }}</button> — signed by {{ a.signer_name }}</p></div>
      <AppModal :open="!!signing" :title="signing?.title ?? ''" wide @close="signing = null">
        <AgreementSign v-if="signing" v-model="sv" :title="signing.title" :md="signing.body ?? ''" /><p v-if="sErr" class="error">{{ sErr }}</p>
        <template #foot><button type="button" class="btn secondary" @click="signing = null">Cancel</button><button type="button" class="btn" :disabled="!sReady || sBusy" @click="signAg">{{ sBusy ? 'Signing…' : 'Sign agreement' }}</button></template>
      </AppModal>
      <div class="card">
        <h2>Reply or send documents</h2>
        <form class="reply" @submit.prevent="send">
          <ClientOnly><RichEditor v-model="reply" compact minimal :min-height="100" :max-length="5000" placeholder="Write a message to the team" /><template #fallback><textarea rows="3" disabled /></template></ClientOnly>
          <button class="btn" type="submit" :disabled="state.busy || !reply.replace(/[\s\u00a0]|&nbsp;/g, '')">Send</button>
        </form>
        <div class="drop" :class="{ over }" role="button" tabindex="0" aria-label="Upload a document"
          @click="fileEl?.click()" @keydown.enter.prevent="fileEl?.click()" @keydown.space.prevent="fileEl?.click()"
          @dragenter.prevent="over = true" @dragover.prevent="over = true" @dragleave.prevent="over = false" @drop.prevent="over = false; upload($event.dataTransfer?.files?.[0])">
          <input ref="fileEl" type="file" class="sr-only" tabindex="-1" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xlsx,.docx" @change="upload(($event.target as HTMLInputElement).files?.[0])">
          <p><b>{{ state.busy ? 'Working…' : 'Drop a document here' }}</b> or click to choose · PDF, Word, Excel or images, up to 25 MB</p>
        </div>
        <p v-if="state.msg" class="error" role="alert">{{ state.msg }}</p><p v-if="state.ok" class="ok" role="status">{{ state.ok }}</p>
      </div>

      <div class="card">
        <h2>Updates</h2>
        <ul class="tl">
          <li v-for="e in data.events" :key="e.id" :data-kind="e.kind">
            <p class="h">{{ WHAT[e.kind] ?? 'Update' }}<template v-if="e.kind === 'status' && e.to_status">: {{ LABEL[e.to_status] }}</template></p>
            <p v-if="e.has_document" class="b"><a :href="'/api/public/job/' + token + '/file/' + e.id">{{ e.document_title }}</a></p>
            <div v-if="e.body" class="b md" v-html="rich(e.body)" />
            <p class="m">{{ when(e.created_at) }}</p>
          </li>
        </ul>
        <EmptyState v-if="!data.events.length" compact icon="empty" title="No updates yet. We'll email you when there is one" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.wrap { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
h1 { margin: 0 0 4px; } h2 { margin-bottom: 12px; }
.center { text-align: center; } .center p { color: var(--c-muted); }
.status { display: flex; flex-direction: column; gap: 4px; } .status b { font-weight: 500; letter-spacing: -0.02em; font-size: 28px; color: var(--c-navy); }
.status[data-s="waiting_client"] b { color: var(--c-warn); } .status[data-s="completed"] b { color: var(--c-ok); }
.due { font-size: 13px; color: var(--c-muted); }
.steps { list-style: none; display: flex; gap: 0; padding: 0; margin: 14px 0 0; }
.steps li { flex: 1; font-size: 12px; color: var(--c-muted); padding-top: 8px; border-top: 3px solid var(--c-rule); } .steps li.done { color: var(--c-navy); border-top-color: var(--c-blue); }
.reply { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; } .reply .btn { align-self: flex-start; }
textarea { font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid var(--c-rule-strong); resize: vertical; }
.drop { border: 1px dashed var(--c-rule-strong); background: var(--c-paper); padding: 18px; text-align: center; cursor: pointer; } .drop p { margin: 0; font-size: 13px; color: var(--c-muted); } .drop b { color: var(--c-navy); }
.drop:hover, .drop.over { background: #eef4f9; border-color: var(--c-blue); } .drop:focus-visible { outline: 2px solid var(--c-blue); outline-offset: 2px; }
.tl { list-style: none; padding: 0; margin: 0; } .tl li { padding: 12px 0 12px 14px; border-left: 2px solid var(--c-blue); border-bottom: 1px solid var(--c-rule); }
.tl li[data-kind^="client"] { border-left-color: var(--c-rule-strong); }
.h { margin: 0; font-weight: 500; color: var(--c-navy); } .b { margin: 4px 0 0; white-space: pre-wrap; } .m { margin: 4px 0 0; font-size: 12px; color: var(--c-muted); }
.error { color: var(--c-danger); margin: 8px 0 0; } .ok { color: var(--c-ok); margin: 8px 0 0; } .muted { color: var(--c-muted); }
 .b.md { white-space: normal; line-height: 1.55; } .md :deep(p) { margin: 0 0 8px; } .md :deep(p:last-child) { margin-bottom: 0; } .md :deep(ul), .md :deep(ol) { margin: 4px 0 8px; padding-left: 20px; } .md :deep(a) { color: var(--c-blue-deep); } .md :deep(blockquote) { margin: 0 0 8px; padding-left: 12px; border-left: 3px solid var(--c-rule-strong); } .md :deep(h2), .md :deep(h3), .md :deep(h4) { font-size: 15px; margin: 6px 0; }
.sign { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; background: #eef4ff; border-color: #c9d8f5; } .sign div { display: flex; flex-direction: column; gap: 2px; } .sign span { font-size: 13.5px; color: var(--c-ink-soft); } .lnk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
</style>
