<script setup lang="ts">
// The top of every Financials page, as one block: the company (or the consolidated group) you are looking at is the
// page title and opens a short list to switch; one line says what the figures are; then that view's own sub-menu.
// Switching keeps you on the same sub-page.
const props = defineProps<{ manage?: boolean }>()
const emit = defineEmits<{ add: []; rename: [] }>()
const { co, pages, options, s, current, subj, currencyOf } = await useFinScope()
const { data: me } = useNuxtData<{ roles: string[] }>('me')
const edit = computed(() => !!props.manage && (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const mainName = computed(() => pages.value.find((p) => p.main)?.name ?? '')
// "Termii Inc group" for a company with subsidiaries; "Group" on Aidi OS; else the company or entity name.
const title = (v: string, label: string) => (v === 'group' ? (co.value && mainName.value ? mainName.value + ' group' : 'Group') : label)
const heading = computed(() => (current.value ? title(current.value.value, current.value.label) : 'Financials'))
const meta = computed(() => {
  if (!current.value) return ''
  if (current.value.group) return 'Consolidated · ' + currencyOf('group') + ' · ' + (co.value ? pages.value.length + ' companies' : 'every fund and entity')
  return current.value.sub
})
// The same switcher as every other page (CompanyMenu); with edit rights it also opens for a lone company, to add one.
const opts = computed(() => options.value.map((x) => ({ value: x.value, label: title(x.value, x.label), sub: x.group ? 'Consolidated' : x.sub })))
</script>

<template>
  <div class="fh">
    <div class="sw">
      <CompanyMenu v-model="s" :options="opts" :heading="heading" :meta="meta" menu-label="Financials for">
        <template v-if="edit && co" #actions><button v-if="current && !current.group" type="button" @click="emit('rename')">Rename · settings for {{ current.label }}</button>
          <button type="button" @click="emit('add')">{{ subj?.subs_hidden ? subj.subs_hidden + ' subsidiar' + (subj.subs_hidden === 1 ? 'y needs' : 'ies need') + ' the Scale plan' : '+ Add a subsidiary' + (subj?.paid ? '' : ' (Scale plan)') }}</button></template>
      </CompanyMenu>
    </div>
    <FinTabs :s="s" :group="s === 'group'" :company="!!co" />
  </div>
</template>

<style scoped>
.fh { margin: 0 0 4px; } .sw { margin: 0 0 14px; }
</style>
