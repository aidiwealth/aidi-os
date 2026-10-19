<script setup lang="ts">
// The top of every Financials page, as one block: the company (or the consolidated group) you are looking at is the
// page title and opens a short list to switch; one line says what the figures are; then that view's own sub-menu.
// Switching keeps you on the same sub-page.
const props = defineProps<{ manage?: boolean }>()
const emit = defineEmits<{ add: []; rename: [] }>()
const { co, pages, options, s, current, subj, currencyOf } = await useFinScope()
const { data: me } = useNuxtData<{ roles: string[] }>('me')
const edit = computed(() => !!props.manage && (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const open = ref(false)
const el = ref<HTMLElement | null>(null)
const mainName = computed(() => pages.value.find((p) => p.main)?.name ?? '')
// "Termii Inc group" for a company with subsidiaries; "Group" on Aidi OS; else the company or entity name.
const title = (v: string, label: string) => (v === 'group' ? (co.value && mainName.value ? mainName.value + ' group' : 'Group') : label)
const heading = computed(() => (current.value ? title(current.value.value, current.value.label) : 'Financials'))
const meta = computed(() => {
  if (!current.value) return ''
  if (current.value.group) return 'Consolidated · ' + currencyOf('group') + ' · ' + (co.value ? pages.value.length + ' companies' : 'every fund and entity')
  return current.value.sub
})
const canSwitch = computed(() => options.value.length > 1 || (edit.value && !!co.value))
function pick(v: string) { open.value = false; s.value = v }
function outside(e: MouseEvent) { if (el.value && !el.value.contains(e.target as Node)) open.value = false }
onMounted(() => document.addEventListener('click', outside))
onBeforeUnmount(() => document.removeEventListener('click', outside))
</script>

<template>
  <div class="fh">
    <div ref="el" class="sw">
      <button v-if="canSwitch" type="button" class="ttl" :aria-expanded="open" aria-haspopup="listbox" @click="open = !open">
        <h1>{{ heading }}</h1><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cv" :class="{ up: open }"><path d="M6 9l6 6 6-6" /></svg></button>
      <h1 v-else class="ttl1">{{ heading }}</h1>
      <p v-if="meta" class="meta">{{ meta }}</p>
      <div v-if="open" class="pop" role="listbox" :aria-label="'Financials for'">
        <p class="ph">Financials for</p>
        <button v-for="o in options" :key="o.value" type="button" role="option" :aria-selected="s === o.value" :class="{ on: s === o.value }" @click="pick(o.value)">
          <span><b>{{ title(o.value, o.label) }}</b><em>{{ o.group ? 'Consolidated' : o.sub }}</em></span><svg v-if="s === o.value" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="ck"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></button>
        <template v-if="edit && co"><hr><button v-if="current && !current.group" type="button" class="act" @click="open = false; emit('rename')">Rename · settings for {{ current.label }}</button>
          <button type="button" class="act" @click="open = false; emit('add')">+ Add a subsidiary{{ subj?.paid ? '' : ' (Scale plan)' }}</button></template>
      </div>
    </div>
    <FinTabs :s="s" :group="s === 'group'" :company="!!co" />
  </div>
</template>

<style scoped>
.fh { margin: 0 0 4px; } .sw { position: relative; margin: 0 0 14px; }
.ttl { display: inline-flex; align-items: center; gap: 8px; background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; }
.ttl h1, .ttl1 { margin: 0; } .ttl:hover h1 { color: var(--c-blue-deep); }
.cv { width: 22px; height: 22px; color: var(--c-muted); flex: none; transition: transform .15s; } .cv.up { transform: rotate(180deg); }
.meta { margin: 4px 0 0; font-size: 13.5px; color: var(--c-muted); }
.pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 40; min-width: 300px; max-width: min(420px, 92vw); max-height: 60vh; overflow-y: auto; background: #fff; border: 1px solid var(--c-rule-strong); box-shadow: 0 12px 30px rgba(12,26,46,.14); padding: 6px 0; }
.ph { margin: 4px 14px 6px; font-size: 11.5px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
.pop button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; background: none; border: 0; padding: 9px 14px; font: inherit; text-align: left; cursor: pointer; color: var(--c-ink); }
.pop button:hover { background: var(--c-paper-3); } .pop button.on b { color: var(--c-navy); }
.pop button span { display: flex; flex-direction: column; gap: 1px; min-width: 0; } .pop b { font-size: 14px; font-weight: 500; } .pop em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.ck { width: 16px; height: 16px; color: var(--c-navy); flex: none; } .pop hr { border: 0; border-top: 1px solid var(--c-rule); margin: 6px 0; }
.pop .act { font-size: 13.5px; color: var(--c-blue-deep); }
</style>
