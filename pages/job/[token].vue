<script setup lang="ts">
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

      <div class="card">
        <h2>Reply or send documents</h2>
        <form class="reply" @submit.prevent="send">
          <textarea v-model="reply" rows="3" maxlength="5000" placeholder="Write a message to the team" required />
          <button class="btn" type="submit" :disabled="state.busy">Send</button>
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
            <p v-if="e.body" class="b">{{ e.body }}</p>
            <p class="m">{{ when(e.created_at) }}</p>
          </li>
        </ul>
        <p v-if="!data.events.length" class="muted">No updates yet. We'll email you when there is one.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wrap { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
h1 { margin: 0 0 4px; } h2 { margin-bottom: 12px; }
.center { text-align: center; } .center p { color: var(--c-muted); }
.status { display: flex; flex-direction: column; gap: 4px; } .status b { font-family: var(--font-heading); font-weight: 500; font-size: 28px; color: var(--c-navy); }
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
</style>
