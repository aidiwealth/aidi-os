<script setup lang="ts">
// The title of Banking and the Stage Monitor: with subsidiaries, the company (or the group) you are
// looking at, switched the same way as Financials (kept in the address, shared across these pages); otherwise the
// page's name.
const props = defineProps<{ page: string }>()
const { options, s, many, pages, current, currencyOf, co, groupName } = await useCoScope()
const { rename } = useRename()
const { data: me } = useNuxtData<{ roles: string[] }>('me')
const admin = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const mainName = computed(() => pages.value.find((p) => p.main)?.name ?? '')
const title = (v: string, label: string) => (v === 'group' ? (mainName.value ? groupName.value : 'Group') : label)
const opts = computed(() => options.value.map((o) => ({ value: o.value, label: title(o.value, o.label), sub: o.group ? 'Consolidated' : o.sub })))
const meta = computed(() => !current.value ? props.page : props.page + ' · ' + (current.value.group ? 'Consolidated · ' + currencyOf('group') + ' · ' + pages.value.length + ' companies' : current.value.sub))
</script>
<template>
  <CompanyMenu v-if="many" v-model="s" :options="opts" :meta="meta" :menu-label="page + ' for'">
    <template v-if="admin && co" #actions><button v-if="current" type="button" @click="rename(current.group ? 'group' : current.value.slice(7), current.group ? groupName : current.label)">Rename {{ current.group ? 'the group' : current.label }}</button><NuxtLink to="/financials?add=sub">+ Add a subsidiary</NuxtLink></template>
  </CompanyMenu>
  <h1 v-else>{{ page }}</h1>
</template>
