<script setup lang="ts">
import type { DocumentRow } from '~/server/api/documents/index.get'
useHead({ title: 'Documents — Aidi OS' })
const { data: docs, error, refresh } = await useFetch<DocumentRow[]>('/api/documents')
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me')
const LEVELS = [
  { v: 'normal', label: 'Normal: team, GPs, family', roles: ['admin', 'gp', 'team', 'family'] },
  { v: 'family', label: 'Family only', roles: ['admin', 'family'] },
  { v: 'restricted', label: 'Restricted: admins only', roles: ['admin'] }
]
const levels = computed(() => LEVELS.filter((l) => l.roles.some((r) => me.value?.roles.includes(r))))
const KINDS = ['agreement', 'statement', 'tax', 'insurance', 'legal', 'report', 'deck', 'other']
const form = reactive({ title: '', kind: 'other', sensitivity: 'normal', entity_id: '' })
const fileEl = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const msg = ref('')
const ok = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function upload() {
  const f = fileEl.value?.files?.[0]
  msg.value = ''; ok.value = ''
  if (!f) { msg.value = 'Choose a file.'; return }
  if (f.size > 25 * 1024 * 1024) { msg.value = 'Files can be up to 25 MB.'; return }
  const fd = new FormData()
  fd.append('file', f); fd.append('title', form.title || f.name.replace(/\.[^.]+$/, '')); fd.append('kind', form.kind)
  fd.append('sensitivity', form.sensitivity); fd.append('entity_id', form.entity_id)
  busy.value = true
  try { await $fetch('/api/documents', { method: 'POST', body: fd }); ok.value = 'Uploaded.'; form.title = ''; if (fileEl.value) fileEl.value.value = ''; await refresh() }
  catch (e) { msg.value = errText(e) } finally { busy.value = false }
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
    <h1>Documents</h1>
    <p class="lead">Stored privately. Links last 60 seconds, and every view is logged.</p>

    <form class="card up" @submit.prevent="upload">
      <label class="label">File<input ref="fileEl" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xlsx,.xls,.docx,.doc,.pptx"></label>
      <label class="label">Title<input v-model="form.title" maxlength="200" placeholder="Defaults to the file name"></label>
      <label class="label">Type<select v-model="form.kind"><option v-for="k in KINDS" :key="k" :value="k">{{ k[0]!.toUpperCase() + k.slice(1) }}</option></select></label>
      <label class="label">Entity<select v-model="form.entity_id"><option value="">None</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      <label class="label">Who can see it<select v-model="form.sensitivity"><option v-for="l in levels" :key="l.v" :value="l.v">{{ l.label }}</option></select></label>
      <button class="btn" type="submit" :disabled="busy">{{ busy ? 'Uploading…' : 'Upload' }}</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>
    </form>

    <p v-if="error" class="error" role="alert">Could not load documents.</p>
    <p v-else-if="!docs?.length" class="muted">No documents yet.</p>
    <table v-else class="table">
      <thead><tr><th>Title</th><th>Entity</th><th>Type</th><th>Access</th><th>Size</th><th>Added</th></tr></thead>
      <tbody>
        <tr v-for="d in docs" :key="d.id">
          <td><button class="link" @click="open(d.id)">{{ d.title }}</button><span class="sub">{{ d.uploaded_by }}</span></td>
          <td>{{ d.entity_name ?? '—' }}</td><td>{{ d.kind }}</td><td>{{ d.sensitivity }}</td><td>{{ size(d.size_bytes) }}</td><td class="muted">{{ date(d.created_at) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.lead { color: var(--c-muted); margin: 8px 0 24px; }
.up { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 18px; align-items: end; margin-bottom: 28px; }
.up label { display: flex; flex-direction: column; gap: 6px; }
.up input, .up select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.up .btn { justify-content: center; }
.table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--c-rule); }
th { text-align: left; font-size: var(--type-label); letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 12px 16px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-navy); font-weight: 500; cursor: pointer; text-align: left; }
.link:hover { text-decoration: underline; }
.sub { display: block; color: var(--c-muted); font-size: 12px; }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); margin: 0; } .ok { color: var(--c-ok); margin: 0; }
@media (max-width: 900px) { .up { grid-template-columns: 1fr; } }
</style>
