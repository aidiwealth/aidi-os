<script setup lang="ts">
// Manual credit score with the bureau report kept on record (for a business, or a guarantor when guarantorId is set).
const props = defineProps<{ borrowerId: string; guarantorId?: string; label?: string }>()
const emit = defineEmits<{ saved: [] }>()
const f = reactive({ score: '' as string | number, source: 'Equifax', note: '' }); const file = ref<File | null>(null); const busy = ref(false); const msg = ref('')
async function save() { busy.value = true; msg.value = ''; const fd = new FormData(); fd.append('borrower_id', props.borrowerId); if (props.guarantorId) fd.append('guarantor_id', props.guarantorId); if (f.score !== '') fd.append('score', String(f.score)); fd.append('source', f.source); fd.append('note', f.note); if (file.value) fd.append('file', file.value)
  try { await $fetch('/api/credit/manual', { method: 'POST', body: fd }); Object.assign(f, { score: '', note: '' }); file.value = null; msg.value = 'Saved.'; emit('saved') } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false } }
</script>
<template>
  <form class="bu" @submit.prevent="save"><b v-if="label">{{ label }}</b>
    <div class="row"><label>Score<input v-model="f.score" type="number" min="300" max="850" placeholder="300–850"></label><label>Source<select v-model="f.source"><option>Equifax</option><option>Experian</option><option>TransUnion</option><option>FICO</option><option>Credit Karma</option><option>Dun &amp; Bradstreet</option><option>Other</option></select></label>
      <label class="fl">Report (PDF or image)<input type="file" accept=".pdf,image/png,image/jpeg,image/webp" @change="file = ($event.target as HTMLInputElement).files?.[0] ?? null"></label></div>
    <input v-model="f.note" maxlength="1000" placeholder="Note (optional), e.g. report dated 1 Oct 2026, pulled by the founder">
    <div class="row"><button class="btn sm" :disabled="busy || (f.score === '' && !file)">{{ busy ? 'Saving…' : 'Save score' }}</button><span v-if="msg" class="m">{{ msg }}</span></div></form>
</template>
<style scoped>
.bu { display: flex; flex-direction: column; gap: 8px; background: var(--c-paper-2); padding: 10px 12px; } .bu b { font-size: 13px; } .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; } label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--c-muted); }
input, select { font: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); background: #fff; } input[type=number] { width: 110px; } .fl input { padding: 4px; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; } .m { font-size: 12.5px; color: var(--c-muted); }
</style>
