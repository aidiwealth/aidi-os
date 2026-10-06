<script setup lang="ts">
// "Add to data room" for a generated document (SAFE, memo, NDA, investor update).
const props = defineProps<{ kind: 'safe' | 'memo' | 'nda' | 'update'; id?: string; label?: string }>()
const busy = ref(false); const msg = ref(''); const ok = ref(false)
async function add() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ title: string; folder: string }>('/api/fundraising/files/generated', { method: 'POST', body: { kind: props.kind, id: props.id } }); ok.value = true; msg.value = 'Added to the data room (' + r.folder + ').' } catch (e) { ok.value = false; msg.value = (e as { data?: { data?: { error?: { message?: string } } }; statusCode?: number }).data?.data?.error?.message ?? 'Could not add it. The data room comes with the Startup plan.' } finally { busy.value = false } }
</script>
<template>
  <span class="atr"><button type="button" class="btn secondary" :disabled="busy" @click="add">{{ busy ? 'Adding…' : label ?? 'Add to data room' }}</button><span v-if="msg" :class="ok ? 'ok' : 'err'">{{ msg }} <NuxtLink v-if="ok" to="/fundraising?t=room">Open</NuxtLink></span></span>
</template>
<style scoped>
.atr { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; } .ok { color: var(--c-ok); font-size: 12.5px; } .err { color: var(--c-danger); font-size: 12.5px; } .ok a { color: var(--c-blue-deep); }
</style>
