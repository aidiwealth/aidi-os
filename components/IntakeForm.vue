<script setup lang="ts">
// Client: fill in the filing form for a job (answers + files).
const props = defineProps<{ jobId: string }>()
interface F { key: string; label: string; type: string; options?: string[]; required?: boolean; help?: string; showIf?: [string, string] }
const { data, refresh } = await useFetch<{ kind: string | null; form?: { title: string; intro: string; fields: F[] }; submitted?: { answers: Record<string, unknown>; files: { field: string; name: string }[]; ssn_last4: string | null; updated_at: string } | null }>(() => '/api/portal/jobs/' + props.jobId + '/intake')
const a = reactive<Record<string, unknown>>({}); const picked = reactive<Record<string, File[]>>({})
watch(data, (d) => { if (d?.submitted) Object.assign(a, d.submitted.answers); for (const f of d?.form?.fields ?? []) if (f.type === 'multi' && !Array.isArray(a[f.key])) a[f.key] = [] }, { immediate: true })
const editing = ref(false); const busy = ref(false); const msg = ref(''); const ok = ref('')
const visible = (f: F) => !f.showIf || a[f.showIf[0]] === f.showIf[1]
const filesFor = (k: string) => data.value?.submitted?.files.filter((x) => x.field === k) ?? []
function pick(f: F, ev: Event) { const list = Array.from((ev.target as HTMLInputElement).files ?? []); picked[f.key] = f.type === 'files' ? [...(picked[f.key] ?? []), ...list] : list.slice(0, 1) }
async function submit() {
  busy.value = true; msg.value = ''; ok.value = ''
  const fd = new FormData(); fd.append('answers', JSON.stringify(a))
  for (const [k, list] of Object.entries(picked)) for (const file of list) fd.append(k, file)
  try { await $fetch('/api/portal/jobs/' + props.jobId + '/intake', { method: 'POST', body: fd }); ok.value = 'Thank you. Our team has your details.'; editing.value = false; for (const k of Object.keys(picked)) delete picked[k]; a.ssn = ''; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send. Try again.' } finally { busy.value = false }
}
</script>
<template>
  <div v-if="data?.kind && data.form" class="card ik">
    <template v-if="data.submitted && !editing"><div class="ih"><div><b>{{ data.form.title }}</b><p class="mut">Sent {{ new Date(data.submitted.updated_at).toLocaleString('en-GB') }} · {{ data.submitted.files.length }} file{{ data.submitted.files.length === 1 ? '' : 's' }}{{ data.submitted.ssn_last4 ? ' · SSN ending ' + data.submitted.ssn_last4 : '' }}</p></div><button class="btn secondary sm" @click="editing = true">Update or add files</button></div><p v-if="ok" class="ok">{{ ok }}</p></template>
    <form v-else class="ifm" @submit.prevent="submit"><div class="ih"><div><b>{{ data.form.title }}</b><p class="mut">{{ data.form.intro }}</p></div></div>
      <template v-for="f in data.form.fields" :key="f.key"><div v-if="visible(f)" class="fq"><span class="ql">{{ f.label }}<em v-if="f.required"> *</em></span><span v-if="f.help" class="mut">{{ f.help }}</span>
        <label v-for="o in (f.type === 'choice' ? f.options : [])" :key="o" class="op"><input v-model="a[f.key]" type="radio" :value="o"> {{ o }}</label>
        <label v-for="o in (f.type === 'multi' ? f.options : [])" :key="o" class="op"><input v-model="(a[f.key] as string[])" type="checkbox" :value="o"> {{ o }}</label>
        <input v-if="f.type === 'text'" v-model="(a[f.key] as string)" maxlength="500"><textarea v-else-if="f.type === 'textarea'" v-model="(a[f.key] as string)" rows="3" maxlength="3000" />
        <input v-else-if="f.type === 'secret'" v-model="(a[f.key] as string)" type="password" inputmode="numeric" autocomplete="off" maxlength="11" :placeholder="data.submitted?.ssn_last4 ? 'On file (ending ' + data.submitted.ssn_last4 + '). Leave blank to keep.' : '123-45-6789'">
        <template v-else-if="f.type === 'file' || f.type === 'files'"><DropZone compact :multiple="f.type === 'files'" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.xls,.csv,.docx" @change="pick(f, $event)" />
          <span v-for="x in filesFor(f.key)" :key="x.name" class="fl">✓ {{ x.name }} (sent)</span><span v-for="x in picked[f.key] ?? []" :key="x.name" class="fl new">+ {{ x.name }}</span></template></div></template>
      <div class="row"><button class="btn" type="submit" :disabled="busy">{{ busy ? 'Sending…' : data.submitted ? 'Send update' : 'Send to the team' }}</button><button v-if="editing" type="button" class="btn secondary" @click="editing = false">Cancel</button></div>
      <p v-if="msg" class="error">{{ msg }}</p></form>
  </div>
</template>
<style scoped>
.ik { margin: 12px 0; } .ih { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; } .ih b { font-size: 15.5px; } .mut { color: var(--c-muted); font-size: 12.5px; margin: 2px 0 0; display: block; }
.ifm { display: flex; flex-direction: column; gap: 14px; } .fq { display: flex; flex-direction: column; gap: 6px; } .ql { font-size: 14px; font-weight: 500; } .ql em { color: var(--c-danger); font-style: normal; } .op { display: flex; gap: 8px; align-items: center; font-size: 14px; } .op input { width: auto; }
input:not([type=radio]):not([type=checkbox]):not([type=file]), textarea { font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--c-rule-strong); background: #fff; } .fl { font-size: 12.5px; color: var(--c-ok); } .fl.new { color: var(--c-blue-deep); }
.row { display: flex; gap: 8px; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; } .ok { color: var(--c-ok); margin: 6px 0 0; } .error { color: var(--c-danger); margin: 0; }
</style>
