<script setup lang="ts">
// Asked once per company: no cash flow statement in the figures, so should Finvry work one out from the P&L and the
// balance sheet? The answer is kept; nothing is asked or flagged again. "inline" is the short form used in upload and
// link reviews; "on" shows the Stop link once it is turned on.
const props = withDefaults(defineProps<{ subject: string; inline?: boolean; showOn?: boolean }>(), { inline: false, showOn: false })
const emit = defineEmits<{ answered: [on: boolean] }>()
const { data, refresh } = await useFetch<{ on: boolean | null }>('/api/financials/cash-flow-policy', { key: computed(() => 'cf-policy:' + props.subject), query: { subject: computed(() => props.subject) }, default: () => ({ on: null }), server: false })
const busy = ref(false); const msg = ref('')
async function answer(on: boolean) {
  busy.value = true; msg.value = ''
  try { await $fetch('/api/financials/cash-flow-policy', { method: 'POST', body: { subject: props.subject, on } }); await refresh(); emit('answered', on) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
</script>

<template>
  <div v-if="/^(entity|company):/.test(subject) && data?.on === null" class="cfa" :class="{ inline }">
    <span><b>No cash flow statement?</b> We can work one out each month from your profit and loss and balance sheet, so burn and runway are right. We will not ask again.</span>
    <span class="sb"><button class="btn sm" type="button" :disabled="busy" @click="answer(true)">Yes, work it out</button><button class="btn secondary sm" type="button" :disabled="busy" @click="answer(false)">No thanks</button></span>
    <span v-if="msg" class="err">{{ msg }}</span>
  </div>
  <p v-else-if="showOn && data?.on === true" class="cfon">Cash flow is worked out from your profit and loss and balance sheet, as you asked, for months that do not have one. <button type="button" class="lk" :disabled="busy" @click="answer(false)">Stop</button></p>
</template>

<style scoped>
.cfa { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; background: #f5f7fb; border: 1px solid #d9e2ef; padding: 12px 16px; font-size: 13.5px; margin: 0 0 12px; }
.cfa.inline { margin: 10px 0; font-size: 13px; padding: 10px 12px; }
.cfa b { font-weight: 500; } .sb { display: flex; gap: 8px; } .err { color: var(--c-danger); font-size: 12.5px; width: 100%; }
.cfon { font-size: 12.5px; color: var(--c-muted); margin: 6px 0 10px; } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
</style>
