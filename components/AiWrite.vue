<script setup lang="ts">
// "Write with AI" for one field: drafts it (or improves what is there) from the other fields and the company's figures.
// Optional instruction; Undo restores the previous text.
const props = defineProps<{ purpose: 'investor_page' | 'raise'; field: string; modelValue: string | null | undefined; context?: Record<string, unknown> }>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
const open = ref(false); const note = ref(''); const busy = ref(false); const err = ref(''); const prev = ref<string | null>(null)
const has = computed(() => !!(props.modelValue ?? '').replace(/[\s#*_>`-]/g, ''))
async function run() {
  busy.value = true; err.value = ''
  try {
    const ctx = Object.fromEntries(Object.entries(props.context ?? {}).filter(([k, v]) => k !== props.field && v != null && typeof v !== 'object' && typeof v !== 'boolean').map(([k, v]) => [k, String(v)]))
    const r = await $fetch<{ text: string }>('/api/ai/write', { method: 'POST', body: { purpose: props.purpose, field: props.field, current: props.modelValue ?? '', instruction: note.value, context: ctx } })
    prev.value = props.modelValue ?? ''; emit('update:modelValue', r.text); open.value = false; note.value = ''
  } catch (e) { err.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not write this just now.' } finally { busy.value = false }
}
function undo() { if (prev.value === null) return; emit('update:modelValue', prev.value); prev.value = null }
</script>
<template>
  <span class="aiw">
    <span class="aib"><button type="button" class="ail" :disabled="busy" @click="open = !open">✨ {{ has ? 'Improve with AI' : 'Write with AI' }}</button><button v-if="prev !== null && !busy" type="button" class="ail mut" @click="undo">Undo</button></span>
    <span v-if="open" class="aip"><input v-model="note" maxlength="600" :placeholder="has ? 'Optional: what to change, e.g. shorter, lead with revenue' : 'Optional: anything to include, e.g. 3 enterprise pilots'" @keydown.enter.prevent="run"><button type="button" class="btn sm" :disabled="busy" @click="run"><AiSpark v-if="busy" /> {{ busy ? 'Writing…' : has ? 'Improve' : 'Write' }}</button><button type="button" class="ail mut" @click="open = false">Cancel</button></span>
    <span v-if="err" class="aie">{{ err }}</span>
  </span>
</template>
<style scoped>
.aiw { display: flex; flex-direction: column; gap: 6px; font-weight: 400; } .aib { display: flex; gap: 12px; } .ail { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; font-weight: 500; color: var(--c-blue-deep); cursor: pointer; } .ail.mut { color: var(--c-muted); font-weight: 400; } .ail:disabled { opacity: .6; }
.aip { display: flex; gap: 8px; align-items: center; background: var(--c-signal-soft); padding: 8px; } .aip input { flex: 1; min-width: 0; font: inherit; font-size: 13.5px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 0; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; }
.aie { font-size: 12.5px; color: var(--c-danger); }
</style>
