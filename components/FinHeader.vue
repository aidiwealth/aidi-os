<script setup lang="ts">
// The top of every Financials page: which company (or the consolidated group) you are looking at, then that view's own
// sub-menu. Switching keeps you on the same sub-page.
const props = defineProps<{ manage?: boolean }>()
const emit = defineEmits<{ add: []; rename: [] }>()
const { co, options, s, current, subj } = await useFinScope()
const { data: me } = useNuxtData<{ roles: string[] }>('me')
const edit = computed(() => !!props.manage && (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const many = computed(() => options.value.length > 6)
</script>

<template>
  <div class="fh">
    <div v-if="options.length > 1 || (edit && co)" class="sc">
      <span class="lab">Financials for</span>
      <div v-if="!many" class="pills" role="tablist" aria-label="Company">
        <button v-for="o in options" :key="o.value" type="button" role="tab" :aria-selected="s === o.value" :class="{ on: s === o.value, g: o.group }" @click="s = o.value"><b>{{ o.label }}</b><em>{{ o.sub }}</em></button>
      </div>
      <select v-else v-model="s" class="sel" aria-label="Financials for"><option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }} · {{ o.sub }}</option></select>
      <span v-if="edit && co" class="acts"><button v-if="current && !current.group" type="button" class="lk" @click="emit('rename')">Rename · settings</button><button type="button" class="lk" @click="emit('add')">+ Add a subsidiary{{ subj?.paid ? '' : ' (Scale plan)' }}</button></span>
    </div>
    <FinTabs :s="s" :group="s === 'group'" :company="!!co" />
  </div>
</template>

<style scoped>
.fh { margin: 0 0 4px; } .sc { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; margin: 0 0 14px; }
.lab { font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
.pills { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--c-rule-strong); background: #fff; }
.pills button { background: none; border: 0; border-right: 1px solid var(--c-rule); padding: 7px 14px; font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; text-align: left; }
.pills button:last-child { border-right: 0; } .pills b { font-size: 14px; font-weight: 500; color: var(--c-ink); } .pills em { font-style: normal; font-size: 11.5px; color: var(--c-muted); }
.pills button.on { background: var(--c-navy); } .pills button.on b, .pills button.on em { color: #fff; } .pills button.on em { opacity: .8; }
.pills button.g:not(.on) b { color: var(--c-navy); }
.sel { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 280px; }
.acts { display: flex; gap: 14px; margin-left: auto; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
</style>
