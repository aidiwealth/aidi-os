<script setup lang="ts">
// Company profile in Settings: legal form and state, which set up the standard filing reminders.
const { data } = await useFetch<{ entity_type: string; state: string; types: Record<string, string>; states: string[] }>('/api/company/profile')
const f = reactive({ entity_type: '', state: 'Delaware', seed: true })
watchEffect(() => { if (data.value) { f.entity_type = data.value.entity_type || ''; f.state = data.value.state || 'Delaware' } })
const msg = ref(''); const ok = ref('')
async function save() { msg.value = ''; ok.value = ''; try { const r = await $fetch<{ added: number }>('/api/company/profile', { method: 'POST', body: f }); ok.value = r.added ? r.added + ' filing reminder' + (r.added === 1 ? '' : 's') + ' added to Compliance.' : 'Saved.' } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
</script>
<template>
  <form v-if="data" class="cp" @submit.prevent="save">
    <h2>Company profile</h2>
    <p class="muted">Your legal form sets up the usual filing deadlines (federal and state tax, annual reports, registered agent, or CAC and FIRS in Nigeria) on your Compliance calendar, with email reminders before each one.</p>
    <label class="label">Company type<select v-model="f.entity_type" required><option value="" disabled>Choose</option><option v-for="(l, k) in data.types" :key="k" :value="k">{{ l }}</option></select></label>
    <label v-if="f.entity_type === 'us_llc' || f.entity_type === 'us_corp'" class="label">State of formation<select v-model="f.state"><option v-for="s in data.states" :key="s">{{ s }}</option></select></label>
    <label class="chk"><input v-model="f.seed" type="checkbox"> Add the standard filing reminders</label>
    <button class="btn" type="submit">Save</button><p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
  </form>
</template>
<style scoped>
.cp { display: flex; flex-direction: column; gap: 10px; } .cp h2 { margin: 0; } label.label { display: flex; flex-direction: column; gap: 6px; } select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 14px; } .chk input { width: auto; } .muted { color: var(--c-muted); font-size: 13px; margin: 0; } .ok { color: var(--c-ok); margin: 0; } .error { color: var(--c-danger); margin: 0; } .btn { align-self: flex-start; }
</style>
