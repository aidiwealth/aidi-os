<script setup lang="ts">
// Tax documents for fund LPs and wealth clients (K-1s, 1099s, WHT credit notes…): upload, notify, and see who opened them.
useHead({ title: 'Tax documents' })
const { data, refresh } = await useFetch<{ rows: Record<string, any>[]; lps: { id: string; name: string; email: string | null }[]; clients: { id: string; name: string; email: string | null; country: string }[]; forms: string[] }>('/api/tax-docs')
const f = reactive({ kind: 'wm', recipient_id: '', tax_year: new Date().getFullYear() - 1, form_type: 'Form 1099-DIV', issuer: '', note: '', notify: true })
const files = ref<File[]>([]); const msg = ref(''); const ok = ref(''); const busy = ref(false); const q = ref('')
const recips = computed(() => (f.kind === 'lp' ? data.value?.lps ?? [] : data.value?.clients ?? []))
async function upload() { busy.value = true; msg.value = ''; ok.value = ''; const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, k === 'notify' ? (v ? '1' : '0') : String(v)); for (const x of files.value) fd.append('file', x)
  try { const r = await $fetch<{ uploaded: number }>('/api/tax-docs', { method: 'POST', body: fd }); ok.value = r.uploaded + ' document' + (r.uploaded === 1 ? '' : 's') + ' uploaded' + (f.notify ? ' and the recipient emailed.' : '.'); files.value = []; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not upload.' } finally { busy.value = false } }
async function del(id: string) { if (!confirm('Delete this tax document?')) return; await $fetch('/api/tax-docs/' + id, { method: 'DELETE' }); await refresh() }
const rows = computed(() => (data.value?.rows ?? []).filter((r) => !q.value || (r.recipient + ' ' + r.form_type + ' ' + r.tax_year).toLowerCase().includes(q.value.toLowerCase())))
</script>
<template>
  <section v-if="data">
    <p class="label">Administration</p><h1>Tax documents</h1><p class="lead">Send tax forms from your fund administrator, advisers or custodians (K-1, K-2/K-3, 1099s, 1042-S, Nigerian WHT credit notes and others) to LPs and wealth clients. They are told by email and find them in their portal.</p>
    <div class="card up"><div class="g3"><label>Recipient type<select v-model="f.kind" @change="f.recipient_id = ''"><option value="wm">Wealth client</option><option value="lp">Fund LP</option></select></label><label>Recipient<select v-model="f.recipient_id"><option value="">Choose</option><option v-for="r in recips" :key="r.id" :value="r.id">{{ r.name }}{{ r.email ? '' : ' (no email)' }}</option></select></label><label>Tax year<input v-model.number="f.tax_year" type="number" min="2000" max="2100"></label>
        <label>Form<select v-model="f.form_type"><option v-for="x in data.forms" :key="x">{{ x }}</option></select></label><label>Issued by<input v-model="f.issuer" placeholder="e.g. fund administrator, Grant Private Wealth, Alpaca"></label><label>Note<input v-model="f.note" placeholder="Optional"></label></div>
      <DropZone multiple accept=".pdf,.png,.jpg,.jpeg,.webp" :label="files.length ? files.length + ' file' + (files.length === 1 ? '' : 's') + ' ready: ' + files.map((x) => x.name).join(', ') : 'Drop tax forms here or click to choose'" hint="PDF or images · up to 25 MB each" @change="(e: Event) => files = Array.from(((e.target as HTMLInputElement).files ?? []) as File[])" />
      <div class="row"><label class="cb"><input v-model="f.notify" type="checkbox"> Email the recipient</label><button class="btn" :disabled="busy || !f.recipient_id || !files.length" @click="upload">{{ busy ? 'Uploading…' : 'Upload and send' }}</button><span v-if="ok" class="okm">{{ ok }}</span><span v-if="msg" class="error">{{ msg }}</span></div></div>
    <div class="flt"><input v-model="q" placeholder="Search recipient, form or year"></div>
    <div class="card tc"><table v-if="rows.length" class="table"><thead><tr><th>Recipient</th><th>Year</th><th>Form</th><th>Issued by</th><th>Sent</th><th>Opened</th><th /></tr></thead><tbody>
      <tr v-for="r in rows" :key="r.id"><td><b>{{ r.recipient }}</b><span class="s">{{ r.kind }}</span></td><td>{{ r.tax_year }}</td><td>{{ r.form_type }}</td><td>{{ r.issuer ?? '—' }}</td><td>{{ new Date(r.created_at).toLocaleDateString('en-GB') }}<span class="s">{{ r.notified_at ? 'emailed' : 'not emailed' }}</span></td><td><span :class="r.first_viewed_at ? 'okm' : 'mut'">{{ r.first_viewed_at ? r.downloads + '×' : 'Not yet' }}</span></td>
        <td><a :href="'/api/tax-docs/' + r.id" target="_blank" class="lk">Open</a> <button class="lk red" @click="del(r.id)">Delete</button></td></tr></tbody></table><EmptyState v-else compact icon="documents" title="No tax documents yet" text="Upload the forms you receive from administrators, advisers and custodians." /></div>
  </section>
</template>
<style scoped>
h1 { margin: 0; } .lead { color: var(--c-muted); max-width: 820px; margin: 4px 0 14px; } .up { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; } .up * { box-sizing: border-box; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; } label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); } input, select { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; } .cb { flex-direction: row; align-items: center; gap: 6px; font-size: 13.5px; color: var(--c-ink); } .cb input { width: auto; } .okm { color: var(--c-ok); font-size: 13px; } .error { color: var(--c-danger); font-size: 13px; } .mut { color: var(--c-muted); }
.flt { margin-bottom: 8px; } .flt input { max-width: 320px; } .tc { padding: 0; overflow-x: auto; } .table { width: 100%; border-collapse: collapse; font-size: 13.5px; } .table th { text-align: left; padding: 10px 14px; white-space: nowrap; } .table td { padding: 11px 14px; border-top: 1px solid var(--c-rule); vertical-align: top; } .s { display: block; font-size: 12px; color: var(--c-muted); }
.lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; padding: 0; text-decoration: none; } .lk.red { color: var(--c-danger); }
@media (max-width: 900px) { .g3 { grid-template-columns: 1fr; } }
</style>
