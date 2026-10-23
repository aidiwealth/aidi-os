<script setup lang="ts">
// The company switcher, the same everywhere: the name (or the group) with a chevron opens a short list, each option with
// what it is underneath (Consolidated, Company, Subsidiary · NGN, Fund…) and a tick on the current one. As the page
// title (Financials, Sales, Marketing, Banking, Stage) or as a smaller filter beside other filters.
interface Opt { value: string; label: string; sub?: string }
const props = withDefaults(defineProps<{ options: Opt[]; modelValue: string; heading?: string; meta?: string; menuLabel: string; size?: 'title' | 'filter' }>(), { heading: '', meta: '', size: 'title' })
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
const open = ref(false), el = ref<HTMLElement | null>(null)
const current = computed(() => props.options.find((o) => o.value === props.modelValue) ?? null)
const shown = computed(() => props.heading || current.value?.label || '')
function pick(v: string) { open.value = false; if (v !== props.modelValue) emit('update:modelValue', v) }
function outside(e: MouseEvent) { if (el.value && !el.value.contains(e.target as Node)) open.value = false }
function key(e: KeyboardEvent) { if (e.key === 'Escape') open.value = false }
onMounted(() => { document.addEventListener('click', outside); document.addEventListener('keydown', key) })
onBeforeUnmount(() => { document.removeEventListener('click', outside); document.removeEventListener('keydown', key) })
</script>
<template>
  <div ref="el" class="cm" :class="size">
    <button v-if="options.length > 1 || $slots.actions" type="button" class="ttl" :aria-expanded="open" aria-haspopup="listbox" @click="open = !open">
      <h1 v-if="size === 'title'">{{ shown }}</h1><span v-else class="fl">{{ shown }}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cv" :class="{ up: open }"><path d="M6 9l6 6 6-6" /></svg></button>
    <template v-else><h1 v-if="size === 'title'" class="ttl1">{{ shown }}</h1><span v-else class="fl one">{{ shown }}</span></template>
    <p v-if="meta && size === 'title'" class="meta">{{ meta }}</p>
    <div v-if="open" class="pop" role="listbox" :aria-label="menuLabel">
      <p class="ph">{{ menuLabel }}</p>
      <button v-for="o in options" :key="o.value" type="button" role="option" :aria-selected="modelValue === o.value" :class="{ on: modelValue === o.value }" @click="pick(o.value)">
        <span><b>{{ o.label }}</b><em v-if="o.sub">{{ o.sub }}</em></span><svg v-if="modelValue === o.value" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="ck"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></button>
      <template v-if="$slots.actions"><hr><div class="acts" @click="open = false"><slot name="actions" /></div></template>
    </div>
  </div>
</template>
<style scoped>
.cm { position: relative; } .cm.title { margin: 0; } .cm.filter { display: inline-block; }
.ttl { display: inline-flex; align-items: center; gap: 8px; background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; }
.ttl h1, .ttl1 { margin: 0; } .ttl:hover h1 { color: var(--c-blue-deep); }
.cv { width: 22px; height: 22px; color: var(--c-muted); flex: none; transition: transform .15s; } .cv.up { transform: rotate(180deg); }
.filter .ttl { height: 36px; padding: 0 10px 0 12px; border: 1px solid var(--c-rule-strong); background: #fff; gap: 6px; } .filter .ttl:hover { border-color: var(--c-navy); }
.filter .cv { width: 16px; height: 16px; } .fl { font-size: 14px; font-weight: 500; color: var(--c-ink); white-space: nowrap; } .fl.one { display: inline-flex; align-items: center; height: 36px; }
.meta { margin: 4px 0 0; font-size: 13.5px; color: var(--c-muted); }
.pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 40; min-width: 300px; max-width: min(420px, 92vw); max-height: 60vh; overflow-y: auto; background: #fff; border: 1px solid var(--c-rule-strong); box-shadow: 0 12px 30px rgba(12,26,46,.14); padding: 6px 0; }
.ph { margin: 4px 14px 6px; font-size: 11.5px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
.pop button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; background: none; border: 0; padding: 9px 14px; font: inherit; text-align: left; cursor: pointer; color: var(--c-ink); }
.pop button:hover { background: var(--c-paper-3); } .pop button.on b { color: var(--c-navy); }
.pop button span { display: flex; flex-direction: column; gap: 1px; min-width: 0; } .pop b { font-size: 14px; font-weight: 500; } .pop em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.ck { width: 16px; height: 16px; color: var(--c-navy); flex: none; } .pop hr { border: 0; border-top: 1px solid var(--c-rule); margin: 6px 0; }
.acts :deep(a), .acts :deep(button) { display: block; width: 100%; padding: 9px 14px; font-size: 13.5px; color: var(--c-blue-deep); text-decoration: none; background: none; border: 0; text-align: left; cursor: pointer; font-family: inherit; } .acts :deep(a:hover), .acts :deep(button:hover) { background: var(--c-paper-3); }
</style>
