<script setup lang="ts">
import type { DocumentRow } from '~/server/api/documents/index.get'
useHead({ title: 'Documents' })
const { data: docs, error, refresh } = await useFetch<DocumentRow[]>('/api/documents')
const { data: meD } = await useFetch<{ roles: string[]; org: { kind: string } | null }>('/api/auth/me', { key: 'me' })
const canDelete = computed(() => !!meD.value?.roles.includes('admin'))
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me')
const LEVELS = [
  { v: 'normal', label: 'Normal: team, GPs, family', roles: ['admin', 'gp', 'team', 'family'] },
  { v: 'family', label: 'Family only', roles: ['admin', 'family'] },
  { v: 'restricted', label: 'Restricted: admins only', roles: ['admin'] }
]
const COMPANY_LEVELS = [
  { v: 'normal', label: 'Everyone in the company (founders and team)', roles: ['admin', 'gp', 'team'] },
  { v: 'restricted', label: 'Admins only', roles: ['admin'] }
]
const isCompany = computed(() => meD.value?.org?.kind === 'company')
const levels = computed(() => (isCompany.value ? COMPANY_LEVELS : LEVELS).filter((l) => l.roles.some((r) => me.value?.roles.includes(r))))
const levelName = (v: string) => (isCompany.value ? { normal: 'Everyone', family: 'Admins only', restricted: 'Admins only' }[v] : { normal: 'Normal', family: 'Family only', restricted: 'Admins only' }[v]) ?? v
const entityFilter = ref('')
const shown = computed(() => (docs.value ?? []).filter((d) => !entityFilter.value || d.entity_name === entityFilter.value))
const KINDS = ['agreement', 'statement', 'tax', 'insurance', 'legal', 'report', 'deck', 'other']
const form = reactive({ title: '', kind: 'other', sensitivity: 'normal', entity_id: '' })
const fileEl = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const msg = ref('')
const ok = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xlsx,.xls,.docx,.doc,.pptx'
const EXT = ACCEPT.split(',')
const files = ref<File[]>([])
const over = ref(false)
const done = ref(0)
function add(list: FileList | null | undefined) {
  msg.value = ''; ok.value = ''
  const skipped: string[] = []
  for (const f of Array.from(list ?? [])) {
    const ext = '.' + (f.name.split('.').pop() ?? '').toLowerCase()
    if (!EXT.includes(ext)) skipped.push(f.name + ' (type not allowed)')
    else if (f.size > 25 * 1024 * 1024) skipped.push(f.name + ' (over 25 MB)')
    else files.value.push(f)
  }
  if (skipped.length) msg.value = 'Skipped: ' + skipped.join(', ')
}
function onPick(e: Event) { const el = e.target as HTMLInputElement; add(el.files); el.value = '' }
function onDrop(e: DragEvent) { over.value = false; add(e.dataTransfer?.files) }
async function upload() {
  msg.value = ''; ok.value = ''
  if (!files.value.length) { msg.value = 'Choose or drop at least one file.'; return }
  busy.value = true; done.value = 0
  const failed: string[] = []
  for (const f of [...files.value]) {
    const fd = new FormData()
    const title = files.value.length === 1 && form.title ? form.title : f.name.replace(/\.[^.]+$/, '')
    fd.append('file', f); fd.append('title', title); fd.append('kind', form.kind)
    fd.append('sensitivity', form.sensitivity); fd.append('entity_id', form.entity_id)
    try { await $fetch('/api/documents', { method: 'POST', body: fd }); done.value++ }
    catch (e) { failed.push(f.name + ': ' + errText(e)) }
  }
  busy.value = false
  if (failed.length) msg.value = failed.join(' · ')
  if (done.value) ok.value = done.value === 1 ? 'Uploaded 1 file.' : 'Uploaded ' + done.value + ' files.'
  files.value = []; form.title = ''
  await refresh()
}
async function open(id: string) {
  try { const r = await $fetch<{ url: string }>('/api/documents/' + id + '/download'); window.location.href = r.url }
  catch (e) { msg.value = errText(e) }
}
const size = (b: string) => { const n = Number(b); return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB' }
const date = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <section>
    <p class="label">Records</p>
    <div class="dh"><h1>Documents</h1><div class="dha"><NuxtLink to="/decks" class="btn secondary">Decks &amp; analytics</NuxtLink><NuxtLink to="/new-document" class="btn">✨ Create a document with AI</NuxtLink></div></div>
    <p class="lead">Stored privately. Links last 60 seconds, and every view is logged.</p>

    <form class="card up" @submit.prevent="upload">
      <div class="drop" :class="{ over }" role="button" tabindex="0" aria-label="Choose files to upload, or drop them here"
        @click="fileEl?.click()" @keydown.enter.prevent="fileEl?.click()" @keydown.space.prevent="fileEl?.click()"
        @dragenter.prevent="over = true" @dragover.prevent="over = true" @dragleave.prevent="over = false" @drop.prevent="onDrop">
        <input ref="fileEl" type="file" multiple class="sr-only" tabindex="-1" :accept="ACCEPT" @change="onPick">
        <p v-if="!files.length" class="drop-main"><b>Drop files here</b> or click to choose</p>
        <ul v-else class="picked">
          <li v-for="(f, i) in files" :key="f.name + i">{{ f.name }} <span>{{ size(String(f.size)) }}</span>
            <button type="button" class="x" :aria-label="'Remove ' + f.name" @click.stop="files.splice(i, 1)">×</button></li>
        </ul>
        <p class="drop-hint">PDF, Word, Excel, PowerPoint, CSV, text or images · up to 25 MB each</p>
      </div>
      <label class="label">Title<input v-model="form.title" maxlength="200" :disabled="files.length > 1" :placeholder="files.length > 1 ? 'Each file keeps its own name' : 'Defaults to the file name'"></label>
      <label class="label">Type<select v-model="form.kind"><option v-for="k in KINDS" :key="k" :value="k">{{ k[0]!.toUpperCase() + k.slice(1) }}</option></select></label>
      <label class="label">Entity<select v-model="form.entity_id"><option value="">None</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      <label class="label">Who can see it<select v-model="form.sensitivity"><option v-for="l in levels" :key="l.v" :value="l.v">{{ l.label }}</option></select></label>
      <button class="btn" type="submit" :disabled="busy || !files.length">{{ busy ? 'Uploading ' + done + ' of ' + files.length + '…' : files.length > 1 ? 'Upload ' + files.length + ' files' : 'Upload' }}</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>
    </form>

    <p v-if="error" class="error" role="alert">Could not load documents.</p>
    <EmptyState v-else-if="!docs?.length" compact icon="documents" title="No documents yet" />
    <label v-if="docs?.length" class="filter"><span class="label">Entity</span><select v-model="entityFilter"><option value="">All entities</option><option v-for="e in entities ?? []" :key="e.id" :value="e.name">{{ e.name }}</option></select></label>
    <table v-if="docs?.length" class="table">
      <thead><tr><th>Title</th><th>Entity</th><th>Type</th><th>Access</th><th>Size</th><th>Added</th></tr></thead>
      <tbody>
        <tr v-for="d in shown" :key="d.id">
          <td><button class="link" @click="open(d.id)">{{ d.title }}</button><span class="sub">{{ d.uploaded_by }}</span></td>
          <td>{{ d.entity_name ?? '—' }}</td><td>{{ d.kind }}</td><td>{{ levelName(d.sensitivity) }}</td><td>{{ size(d.size_bytes) }}</td><td class="muted">{{ date(d.created_at) }}<DeleteButton v-if="canDelete" type="document" :id="d.id" :name="d.title" link @deleted="refresh()" /></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.lead { color: var(--c-muted); margin: 8px 0 24px; }
.filter { display: inline-flex; gap: 10px; align-items: center; margin-bottom: 12px; } .filter select { font: inherit; padding: 6px 8px; border: 1px solid var(--c-rule-strong); background: #fff; }
.up { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 18px; align-items: end; margin-bottom: 28px; }
.up label { display: flex; flex-direction: column; gap: 6px; }
.up input, .up select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.up .btn { justify-content: center; }
.drop { grid-column: 1 / -1; border: 1px dashed var(--c-rule-strong); background: var(--c-paper); padding: 26px; text-align: center; cursor: pointer; transition: background .15s, border-color .15s; }
.drop:hover, .drop.over { background: #eef4f9; border-color: var(--c-blue); }
.drop:focus-visible { outline: 2px solid var(--c-blue); outline-offset: 2px; }
.drop-main { margin: 0; color: var(--c-ink-soft); } .drop-main b { color: var(--c-navy); }
.drop-hint { margin: 6px 0 0; font-size: 12px; color: var(--c-muted); }
.picked { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.picked li { background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 6px 8px 6px 12px; font-size: 13px; }
.picked span { color: var(--c-muted); margin-left: 6px; }
.x { background: none; border: 0; font-size: 16px; line-height: 1; margin-left: 6px; cursor: pointer; color: var(--c-muted); }
.table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); }
th { text-align: left; font-size: var(--type-label); letter-spacing: 0; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 12px 16px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-navy); font-weight: 500; cursor: pointer; text-align: left; }
.link:hover { text-decoration: underline; }
.sub { display: block; color: var(--c-muted); font-size: 12px; }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); margin: 0; } .ok { color: var(--c-ok); margin: 0; }
@media (max-width: 900px) { .up { grid-template-columns: 1fr; } }
.dh { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; } .dh h1 { margin: 0; } .dh a { text-decoration: none; }
.dha { display: flex; gap: 8px; } .dha a { text-decoration: none; }
</style>
