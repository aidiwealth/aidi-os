<script setup lang="ts">
// The title of Sales, Marketing, Banking and the Stage Monitor: with subsidiaries, the company (or the group) you are
// looking at, switched the same way as Financials (kept in the address, shared across these pages); otherwise the
// page's name.
const props = defineProps<{ page: string }>()
const { options, s, many, pages, current, currencyOf, co } = await useCoScope()
const { data: me } = useNuxtData<{ roles: string[] }>('me')
const admin = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const mainName = computed(() => pages.value.find((p) => p.main)?.name ?? '')
const title = (v: string, label: string) => (v === 'group' ? (mainName.value ? mainName.value + ' group' : 'Group') : label)
const opts = computed(() => options.value.map((o) => ({ value: o.value, label: title(o.value, o.label), sub: o.group ? 'Consolidated' : o.sub })))
const meta = computed(() => !current.value ? props.page : props.page + ' · ' + (current.value.group ? 'Consolidated · ' + currencyOf('group') + ' · ' + pages.value.length + ' companies' : current.value.sub))
</script>
<template>
  <CompanyMenu v-if="many" v-model="s" :options="opts" :meta="meta" :menu-label="page + ' for'">
    <template v-if="admin && co" #actions><NuxtLink to="/financials?add=sub">+ Add a subsidiary</NuxtLink></template>
  </CompanyMenu>
  <h1 v-else>{{ page }}</h1>
</template>
