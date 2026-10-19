<script setup lang="ts">
// One button that opens a short list of less-used actions, so a page header shows one or two buttons, not seven.
// Put <button> or <a> elements in the slot; the menu closes after a click inside it, on Escape or a click outside.
withDefaults(defineProps<{ label?: string; align?: 'left' | 'right' }>(), { label: 'More', align: 'right' })
const open = ref(false)
const el = ref<HTMLElement | null>(null)
function outside(e: MouseEvent) { if (el.value && !el.value.contains(e.target as Node)) open.value = false }
function esc(e: KeyboardEvent) { if (e.key === 'Escape') open.value = false }
onMounted(() => { document.addEventListener('click', outside); document.addEventListener('keydown', esc) })
onBeforeUnmount(() => { document.removeEventListener('click', outside); document.removeEventListener('keydown', esc) })
</script>

<template>
  <div ref="el" class="mm">
    <button type="button" class="btn secondary" :aria-expanded="open" aria-haspopup="menu" @click="open = !open">{{ label }}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cv" :class="{ up: open }"><path d="M6 9l6 6 6-6" /></svg></button>
    <div v-if="open" class="mm-p" :class="align" role="menu" @click="open = false"><slot /></div>
  </div>
</template>

<style scoped>
.mm { position: relative; display: inline-flex; }
.btn { display: inline-flex; align-items: center; gap: 6px; } .cv { width: 14px; height: 14px; transition: transform .15s; } .cv.up { transform: rotate(180deg); }
.mm-p { position: absolute; top: calc(100% + 4px); z-index: 40; min-width: 230px; background: #fff; border: 1px solid var(--c-rule-strong); box-shadow: 0 10px 28px rgba(12,26,46,.12); padding: 4px 0; display: flex; flex-direction: column; }
.mm-p.right { right: 0; } .mm-p.left { left: 0; }
.mm-p :slotted(button), .mm-p :slotted(a) { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 9px 14px; font: inherit; font-size: 13.5px; color: var(--c-ink); text-decoration: none; cursor: pointer; white-space: nowrap; }
.mm-p :slotted(button:hover), .mm-p :slotted(a:hover) { background: var(--c-paper-3); } .mm-p :slotted(button:disabled) { color: var(--c-muted); cursor: default; background: none; }
.mm-p :slotted(hr) { border: 0; border-top: 1px solid var(--c-rule); margin: 4px 0; } .mm-p :slotted(.red) { color: var(--c-danger); }
.mm-p :slotted(p) { margin: 6px 14px 2px; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
</style>
