<script setup lang="ts">
// Desk: the client's filing form on a job — answers, files and a masked SSN with an audited reveal.
const props = defineProps<{ jobId: string }>()
interface F { key: string; label: string; type: string }
const { data } = await useFetch<{ id: string; kind: string; answers: Record<string, unknown>; files: { field: string; doc_id: string; name: string }[]; ssn_last4: string | null; submitted_by: string | null; updated_at: string; form: { title: string; fields: F[] } } | null>(() => '/api/services/intakes/' + props.jobId)
const ssn = ref('')
async function reveal() { if (!data.value || !confirm('Show the full SSN? This is recorded.')) return; ssn.value = (await $fetch<{ ssn: string }>('/api/services/intakes/' + data.value.id + '/reveal', { method: 'POST' })).ssn }
const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')) || '—'
</script>
<template>
  <div v-if="data" class="card iv"><div class="ih"><b>{{ data.form.title }}</b><span class="mut">from {{ data.submitted_by }} · {{ new Date(data.updated_at).toLocaleString('en-GB') }}</span></div>
    <dl><template v-for="f in data.form.fields" :key="f.key">
      <template v-if="f.type === 'secret'"><dt>{{ f.label }}</dt><dd>{{ ssn || (data.ssn_last4 ? '•••-••-' + data.ssn_last4 : '—') }} <button v-if="data.ssn_last4 && !ssn" class="lk" @click="reveal">Reveal</button></dd></template>
      <template v-else-if="f.type === 'file' || f.type === 'files'"><dt>{{ f.label }}</dt><dd><a v-for="x in data.files.filter((y) => y.field === f.key)" :key="x.doc_id" :href="'/api/services/intakes/' + data.id + '/file/' + x.doc_id" target="_blank" class="fl">📎 {{ x.name }}</a><span v-if="!data.files.some((y) => y.field === f.key)">—</span></dd></template>
      <template v-else-if="data.answers[f.key] !== undefined && data.answers[f.key] !== ''"><dt>{{ f.label }}</dt><dd class="pre">{{ show(data.answers[f.key]) }}</dd></template></template></dl></div>
  <div v-else class="card iv empty"><span class="mut">The client has not sent the filing form yet. They see it on their request page.</span></div>
</template>
<style scoped>
.iv { margin: 12px 0; } .ih { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; } .ih b { font-size: 15px; } .mut { color: var(--c-muted); font-size: 12.5px; }
dl { display: grid; grid-template-columns: minmax(180px, 1fr) 2fr; gap: 8px 14px; margin: 0; font-size: 13.5px; } dt { color: var(--c-muted); } dd { margin: 0; } .pre { white-space: pre-wrap; } .fl { display: block; color: var(--c-blue-deep); } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; }
.empty { font-size: 13px; }
</style>
