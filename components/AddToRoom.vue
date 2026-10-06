<script setup lang="ts">
// "Add to data room" for a generated document (SAFE, memo, NDA, investor update): the button itself confirms.
const props = defineProps<{ kind: 'safe' | 'memo' | 'nda' | 'update'; id?: string; label?: string }>()
const state = ref<'idle' | 'busy' | 'done' | 'error'>('idle'); const err = ref(''); const folder = ref('')
async function add() { state.value = 'busy'; err.value = ''; try { const r = await $fetch<{ folder: string }>('/api/fundraising/files/generated', { method: 'POST', body: { kind: props.kind, id: props.id } }); folder.value = r.folder; state.value = 'done'; setTimeout(() => { if (state.value === 'done') state.value = 'idle' }, 6000) } catch (e) { err.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add it.'; state.value = 'error' } }
</script>
<template>
  <span class="atr">
    <NuxtLink v-if="state === 'done'" to="/fundraising?t=room" class="btn secondary done" :title="'Added to the ' + folder + ' folder. Open the data room'"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5l3.2 3L13 4.5" /></svg>In data room · View</NuxtLink>
    <button v-else type="button" class="btn secondary" :class="{ bad: state === 'error' }" :disabled="state === 'busy'" :title="state === 'error' ? err : ''" @click="add">{{ state === 'busy' ? 'Adding…' : state === 'error' ? 'Try again' : label ?? 'Add to data room' }}</button>
  </span>
</template>
<style scoped>
.atr { display: inline-flex; } .done { color: var(--c-ok) !important; border-color: rgba(31,122,77,.45) !important; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; white-space: nowrap; } .bad { border-color: var(--c-danger) !important; color: var(--c-danger) !important; }
</style>
