<script setup lang="ts">
// Desk: the client's filing / formation form on a job — answers, files and a masked SSN with an audited reveal.
// The team can correct it (or fill it in for the client); files already sent are kept.
import { fieldVisible, type IntakeField } from '~/shared/intake'
const props = defineProps<{ jobId: string }>()
const { data, refresh } = await useFetch<{ id: string; kind: string; answers: Record<string, unknown>; files: { field: string; doc_id: string; name: string }[]; ssn_last4: string | null; submitted_by: string | null; updated_at: string; form: { title: string; intro?: string; fields: IntakeField[] } } | null>(() => '/api/services/intakes/' + props.jobId)
const { data: blank } = await useFetch<{ kind: string | null; form?: { title: string; intro: string; fields: IntakeField[] } }>(() => '/api/services/' + props.jobId + '/intake-form', { server: false, lazy: true })
const form = computed(() => data.value?.form ?? blank.value?.form ?? null)
const ssn = ref('')
async function reveal() { if (!data.value || !confirm('Show the full SSN? This is recorded.')) return; ssn.value = (await $fetch<{ ssn: string }>('/api/services/intakes/' + data.value.id + '/reveal', { method: 'POST' })).ssn }
// Edit
const editing = ref(false), busy = ref(false), msg = ref(''), ok = ref('')
const a = reactive<Record<string, unknown>>({}); const picked = reactive<Record<string, File[]>>({})
function startEdit() {
  for (const k of Object.keys(a)) delete a[k]
  Object.assign(a, JSON.parse(JSON.stringify(data.value?.answers ?? {})))
  for (const f of form.value?.fields ?? []) if (f.type === 'multi' && !Array.isArray(a[f.key])) a[f.key] = []
  for (const k of Object.keys(picked)) delete picked[k]
  msg.value = ''; ok.value = ''; editing.value = true
}
function pick(f: IntakeField, ev: Event) { const list = Array.from((ev.target as HTMLInputElement).files ?? []); picked[f.key] = f.type === 'files' ? [...(picked[f.key] ?? []), ...list] : list.slice(0, 1) }
const filesFor = (k: string) => data.value?.files.filter((x) => x.field === k) ?? []
async function save() {
  busy.value = true; msg.value = ''
  const fd = new FormData(); fd.append('answers', JSON.stringify(a))
  for (const [k, list] of Object.entries(picked)) for (const file of list) fd.append(k, file)
  try { await $fetch('/api/services/' + props.jobId + '/intake', { method: 'POST', body: fd }); editing.value = false; ok.value = 'Saved. The client sees the updated details on their request.'; a.ssn = ''; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
</script>
<template>
  <div v-if="form" class="card iv">
    <form v-if="editing" class="ivf" @submit.prevent="save">
      <div class="ivh"><h2>{{ data ? 'Edit' : 'Fill in' }}: {{ form.title }}</h2><span class="muted">Saved for the client; they see the change on their request.</span></div>
      <template v-for="f in form.fields" :key="f.key"><div v-if="fieldVisible(f, a)" class="fq"><span class="ql">{{ f.label }}<em v-if="f.required"> *</em></span>
        <div v-if="f.type === 'choice'" class="chs"><button v-for="o in f.options" :key="o" type="button" :class="{ on: a[f.key] === o }" @click="a[f.key] = o">{{ o }}</button></div>
        <div v-else-if="f.type === 'multi'" class="chs"><label v-for="o in f.options" :key="o" class="op"><input v-model="(a[f.key] as string[])" type="checkbox" :value="o"> {{ o }}</label></div>
        <input v-else-if="f.type === 'text'" v-model="(a[f.key] as string)" maxlength="500">
        <textarea v-else-if="f.type === 'textarea'" v-model="(a[f.key] as string)" rows="3" maxlength="3000" />
        <input v-else-if="f.type === 'secret'" v-model="(a[f.key] as string)" type="password" inputmode="numeric" autocomplete="off" maxlength="11" :placeholder="data?.ssn_last4 ? 'On file (ending ' + data.ssn_last4 + '). Leave blank to keep.' : '123-45-6789'">
        <template v-else-if="f.type === 'file' || f.type === 'files'"><DropZone compact :multiple="f.type === 'files'" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.xls,.csv,.docx" @change="pick(f, $event)" />
          <span v-for="x in filesFor(f.key)" :key="x.doc_id" class="fl">✓ {{ x.name }} (on file{{ f.type === 'file' ? ' — a new upload replaces it' : '' }})</span><span v-for="x in picked[f.key] ?? []" :key="x.name" class="fl new">+ {{ x.name }}</span></template></div></template>
      <p v-if="msg" class="error">{{ msg }}</p>
      <div class="ra"><button type="button" class="btn secondary" @click="editing = false">Cancel</button><button class="btn" :disabled="busy">{{ busy ? 'Saving…' : 'Save' }}</button></div>
    </form>
    <template v-else-if="data">
      <IntakeSummary :form="data.form" :answers="data.answers" :files="data.files.map((x) => ({ field: x.field, name: x.name, url: '/api/services/intakes/' + data!.id + '/file/' + x.doc_id }))" :ssn-last4="data.ssn_last4" :ssn="ssn" can-reveal :by="data.submitted_by" :at="data.updated_at" @reveal="reveal" />
      <div class="ft"><span v-if="ok" class="okm">{{ ok }}</span><span v-else class="muted">Something wrong or missing? Correct it here.</span><button type="button" class="btn secondary sm" @click="startEdit">Edit details</button></div>
    </template>
    <div v-else class="empty"><div><b>{{ form.title }}</b><span class="muted">The client has not sent this yet. They see it on their request page.</span></div><button type="button" class="btn secondary sm" @click="startEdit">Fill in for the client</button></div>
  </div>
</template>
<style scoped>
.iv { border-radius: 0; } .muted { color: var(--c-muted); font-size: 13px; }
.ft { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--c-rule); } .okm { color: var(--c-ok); font-size: 13px; }
.empty { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; } .empty > div { display: flex; flex-direction: column; gap: 2px; }
.ivf { display: flex; flex-direction: column; gap: 14px; } .ivh { display: flex; flex-direction: column; gap: 2px; } .ivh h2 { margin: 0; font-size: 17px; }
.fq { display: flex; flex-direction: column; gap: 6px; } .ql { font-size: 14px; font-weight: 500; } .ql em { color: var(--c-danger); font-style: normal; }
.chs { display: flex; flex-wrap: wrap; gap: 6px; } .chs button { font: inherit; font-size: 13.5px; padding: 7px 12px; background: #fff; border: 1px solid var(--c-rule-strong); cursor: pointer; } .chs button.on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.op { display: flex; gap: 8px; align-items: center; font-size: 14px; } .op input { width: auto; }
input:not([type=radio]):not([type=checkbox]):not([type=file]), textarea { font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--c-rule-strong); background: #fff; }
.fl { font-size: 12.5px; color: var(--c-ok); } .fl.new { color: var(--c-blue-deep); } .error { color: var(--c-danger); margin: 0; } .ra { display: flex; justify-content: flex-end; gap: 8px; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; }
</style>
