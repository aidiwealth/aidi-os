<script setup lang="ts">
// Asked once: one company, or a group with subsidiaries? A group gets subsidiaries' own Financials, a group overview
// in one currency, and bank balances read as part of the cash rather than all of it.
const props = defineProps<{ name: string }>()
const emit = defineEmits<{ answered: [v: 'single' | 'group'] }>()
const busy = ref(false), msg = ref('')
async function answer(v: 'single' | 'group') {
  busy.value = true; msg.value = ''
  try { await $fetch('/api/company/structure', { method: 'POST', body: { structure: v } }); emit('answered', v) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
void props
</script>
<template>
  <div class="card sa">
    <div><b>Is {{ name }} one company, or a group with subsidiaries?</b><span>A group keeps each subsidiary in its own currency. Bank connections cover US accounts only.</span></div>
    <div class="ab"><button class="btn secondary sm" type="button" :disabled="busy" @click="answer('single')">One company</button><button class="btn sm" type="button" :disabled="busy" @click="answer('group')">A group with subsidiaries</button></div>
    <p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.sa { display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 14px; border-color: #d9e2ef; background: #f5f7fb; }
.sa b { display: block; font-weight: 500; margin-bottom: 3px; } .sa span { font-size: 13px; color: var(--c-ink-soft); } .sa > div:first-child { flex: 1 1 420px; } .ab { display: flex; gap: 8px; } .btn.sm { padding: 6px 12px; font-size: 13px; white-space: nowrap; } .error { color: var(--c-danger); font-size: 13px; margin: 0; }
</style>
