<script setup lang="ts">
// Delete with a confirmation. Goes to `to` afterwards, or emits `deleted` (for lists).
const props = withDefaults(defineProps<{ type: string; id: string; name: string; to?: string; link?: boolean; url?: string }>(), { to: '', link: false, url: '' })
const emit = defineEmits<{ deleted: [] }>()
const busy = ref(false)
async function run() {
  if (!confirm('Delete ' + props.name + '? This cannot be undone.')) return
  busy.value = true
  try {
    await $fetch(props.url || '/api/records/' + props.type + '/' + props.id, { method: 'DELETE' })
    emit('deleted')
    if (props.to) await navigateTo(props.to)
  } catch (e) {
    alert((e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not delete.')
  } finally { busy.value = false }
}
</script>

<template>
  <button type="button" :class="link ? 'del-link' : 'btn secondary del'" :disabled="busy" @click="run">{{ busy ? 'Deleting…' : 'Delete' }}</button>
</template>

<style scoped>
.del { color: var(--c-danger); border-color: rgba(180,35,24,.35); } .del:hover { background: rgba(180,35,24,.06); border-color: var(--c-danger); }
.del-link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-danger); cursor: pointer; margin-left: 12px; }
</style>
