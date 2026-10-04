<script setup lang="ts">
// A popup: dimmed backdrop, title, body and footer. Closes on Escape or backdrop click.
const props = withDefaults(defineProps<{ open: boolean; title?: string; wide?: boolean }>(), { title: '', wide: false })
const emit = defineEmits<{ close: [] }>()
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && props.open) emit('close') }
onMounted(() => window.addEventListener('keydown', onKey)); onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
<template>
  <Teleport to="body"><div v-if="open" class="mb" @mousedown.self="emit('close')"><div class="mw" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title">
    <header v-if="title || $slots.head"><slot name="head"><h2>{{ title }}</h2></slot><button type="button" class="x" aria-label="Close" @click="emit('close')">×</button></header>
    <div class="body"><slot /></div><footer v-if="$slots.foot"><slot name="foot" /></footer>
  </div></div></Teleport>
</template>
<style scoped>
.mb { position: fixed; inset: 0; background: rgba(12, 26, 46, .45); z-index: 1000; display: flex; align-items: flex-start; justify-content: center; padding: 6vh 16px; overflow-y: auto; }
.mw { background: #fff; width: 100%; max-width: 560px; box-shadow: 0 24px 60px rgba(12, 26, 46, .25); display: flex; flex-direction: column; } .mw.wide { max-width: 860px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 20px 24px 14px; border-bottom: 1px solid var(--c-rule); } header :deep(h2) { margin: 0; font-size: 24px; }
.x { background: none; border: 0; font-size: 26px; line-height: 1; color: var(--c-muted); cursor: pointer; padding: 0 4px; } .body { padding: 20px 24px; } footer { padding: 14px 24px 20px; border-top: 1px solid var(--c-rule); display: flex; justify-content: flex-end; gap: 10px; }
</style>
