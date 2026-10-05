<script setup lang="ts">
// Drag-and-drop upload area (also click to choose). Emits a change event shaped like the file input's, so existing
// upload handlers keep working. Compact mode is a slim one-line strip.
const props = withDefaults(defineProps<{ accept?: string; multiple?: boolean; disabled?: boolean; label?: string; hint?: string; compact?: boolean }>(), { accept: '', multiple: false, disabled: false, label: '', hint: '', compact: false })
const emit = defineEmits<{ change: [ev: Event] }>()
const over = ref(false); const input = ref<HTMLInputElement | null>(null)
const okType = (f: File) => !props.accept || props.accept.split(',').some((a) => f.name.toLowerCase().endsWith(a.trim().toLowerCase()))
function give(list: File[]) { const files = (props.multiple ? list : list.slice(0, 1)).filter(okType); if (files.length) emit('change', { target: { files } } as unknown as Event) }
function drop(e: DragEvent) { over.value = false; if (props.disabled) return; give(Array.from(e.dataTransfer?.files ?? [])) }
function pick(e: Event) { give(Array.from((e.target as HTMLInputElement).files ?? [])); (e.target as HTMLInputElement).value = '' }
</script>
<template>
  <label class="dz" :class="{ over, compact, off: disabled }" @dragenter.prevent="over = !disabled" @dragover.prevent="over = !disabled" @dragleave.prevent="over = false" @drop.prevent="drop">
    <input ref="input" type="file" class="sr" :accept="accept" :multiple="multiple" :disabled="disabled" @change="pick">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 16V4m0 0l-4 4m4-4l4 4" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
    <span class="t"><b>{{ label || (over ? 'Drop to upload' : multiple ? 'Drag and drop files here' : 'Drag and drop a file here') }}</b><em v-if="!compact || hint">{{ hint || 'or click to choose' }}</em></span>
  </label>
</template>
<style scoped>
.dz { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; border: 1.5px dashed var(--c-rule-strong); background: #fff; padding: 26px 18px; cursor: pointer; transition: border-color .12s, background .12s; color: var(--c-ink-soft); }
.dz:hover { border-color: var(--c-blue-deep); } .dz.over { border-color: var(--c-blue-deep); background: var(--c-signal-soft); } .dz.off { opacity: .6; cursor: default; }
.dz svg { width: 26px; height: 26px; color: var(--c-blue-deep); } .t { display: flex; flex-direction: column; gap: 2px; } .t b { font-weight: 500; font-size: 14px; color: var(--c-ink); } .t em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.dz.compact { flex-direction: row; justify-content: flex-start; padding: 10px 14px; text-align: left; gap: 10px; } .dz.compact svg { width: 18px; height: 18px; } .dz.compact .t b { font-size: 13.5px; }
.sr { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; pointer-events: none; }
</style>
