<script setup lang="ts">
// Updates waiting from a linked bank sheet (kept in step), shown at the top of Banking: review what would change,
// then accept or dismiss. Nothing from a link is written without this.
import type { ImportSummary } from '~/shared/growth'
const props = defineProps<{ kind: 'bank_txns'; what: string }>()
const emit = defineEmits<{ done: [] }>()
const { sf, cust } = await useCoScope()
interface P { id: string; name: string; summary: ImportSummary; created_at: string }
const list = ref<P[]>([]), open = ref<P | null>(null), busy = ref(false), msg = ref('')
async function load() { try { list.value = await sf<P[]>('/api/growth/pending', { query: { kind: props.kind } }) } catch { list.value = [] } }
watch(() => cust.value, load, { immediate: true })
async function settle(accept: boolean) {
  if (!open.value) return; busy.value = true; msg.value = ''
  try { await sf('/api/growth/pending/settle', { method: 'POST', body: { id: open.value.id, accept } }); open.value = null; await load(); emit('done') }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save that.' } finally { busy.value = false }
}
defineExpose({ load })
</script>
<template>
  <div v-if="list.length" class="pu">
    <div v-for="x in list" :key="x.id" class="row"><span><b>{{ x.name }}</b> has {{ x.summary.added }} new and {{ x.summary.changed }} changed {{ what }} waiting for you.</span><button class="btn sm secondary" @click="open = x">Review</button></div>
    <AppModal :open="!!open" :title="open ? 'Updates from ' + open.name : ''" wide @close="open = null">
      <ImportReview v-if="open" :summary="open.summary" :busy="busy" :what="what" @accept="settle(true)" @dismiss="settle(false)" />
      <p v-if="msg" class="error">{{ msg }}</p>
    </AppModal>
  </div>
</template>
<style scoped>
.pu { display: flex; flex-direction: column; gap: 6px; } .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; border: 1px solid var(--c-rule-strong); background: #f6f8fb; padding: 9px 14px; font-size: 13.5px; }
.btn.sm { height: 30px; padding: 0 12px; font-size: 13px; } .error { color: var(--c-danger); font-size: 13px; }
</style>
