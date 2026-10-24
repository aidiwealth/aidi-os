<script setup lang="ts">
// A 6-digit code as six boxes: typing moves on, Backspace goes back, a pasted code (or the phone's one-time-code
// suggestion) fills them all, and `complete` fires once all six are in.
const props = withDefaults(defineProps<{ modelValue: string; disabled?: boolean; invalid?: boolean; autofocus?: boolean }>(), { disabled: false, invalid: false, autofocus: false })
const emit = defineEmits<{ 'update:modelValue': [v: string]; complete: [v: string] }>()
const boxes = ref<HTMLInputElement[]>([])
const digits = computed(() => Array.from({ length: 6 }, (_, i) => props.modelValue[i] ?? ''))
function set(v: string) { const c = v.replace(/\D/g, '').slice(0, 6); emit('update:modelValue', c); if (c.length === 6) emit('complete', c) }
function onInput(i: number, ev: Event) {
  const t = ev.target as HTMLInputElement, v = t.value.replace(/\D/g, '')
  if (!v) { t.value = ''; return }
  const cur = digits.value.slice(0, i).join('') + v + digits.value.slice(i + v.length).join('')
  set(cur); nextTick(() => boxes.value[Math.min(5, i + v.length)]?.focus())
}
function onKey(i: number, ev: KeyboardEvent) {
  if (ev.key === 'Backspace') { ev.preventDefault(); const d = [...digits.value]; if (d[i]) d[i] = ''; else if (i > 0) { d[i - 1] = ''; boxes.value[i - 1]?.focus() } emit('update:modelValue', d.join('').replace(/\D/g, '')) }
  else if (ev.key === 'ArrowLeft' && i > 0) boxes.value[i - 1]?.focus()
  else if (ev.key === 'ArrowRight' && i < 5) boxes.value[i + 1]?.focus()
}
function onPaste(ev: ClipboardEvent) { const v = (ev.clipboardData?.getData('text') ?? '').replace(/\D/g, ''); if (!v) return; ev.preventDefault(); set(v); nextTick(() => boxes.value[Math.min(5, v.length)]?.focus()) }
const focusFirst = () => boxes.value[Math.min(5, props.modelValue.length)]?.focus()
onMounted(() => { if (props.autofocus) focusFirst() })
defineExpose({ focus: focusFirst })
</script>
<template>
  <div class="cb" :class="{ bad: invalid }" @paste="onPaste">
    <input v-for="(d, i) in digits" :key="i" :ref="(el) => { if (el) boxes[i] = el as HTMLInputElement }" :value="d" inputmode="numeric" :autocomplete="i === 0 ? 'one-time-code' : 'off'" :maxlength="i === 0 ? 6 : 1" :aria-label="'Digit ' + (i + 1)" :disabled="disabled" @input="onInput(i, $event)" @keydown="onKey(i, $event)" @focus="($event.target as HTMLInputElement).select()">
  </div>
</template>
<style scoped>
.cb { display: flex; gap: 8px; justify-content: center; }
.cb input { width: 46px; height: 54px; text-align: center; font-size: 22px; font-weight: 600; font-family: var(--font-heading); color: var(--c-ink); border: 1px solid var(--c-rule-strong); background: #fff; padding: 0; transition: border-color .12s; }
.cb input:nth-child(3) { margin-right: 10px; } .cb.bad input { border-color: var(--c-danger); }
@media (max-width: 420px) { .cb { gap: 6px; } .cb input { width: 40px; height: 48px; font-size: 20px; } }
</style>
