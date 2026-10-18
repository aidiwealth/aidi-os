<script setup lang="ts">
// Financials sub-menu inside the page for a company: overview, statements and sharing, then revenue retention and
// customers (paid; a lock shows on the free plan).
const route = useRoute()
const { data: mods } = useNuxtData<{ code: string; locked?: boolean }[]>('modules')
const locked = computed(() => !!mods.value?.find((m) => m.code === 'fin_customers' && m.locked))
const T: [string, string, boolean][] = [['/financials', 'Overview', false], ['/financials?tab=statements', 'Statements', false], ['/financials?tab=shares', 'Sharing', false], ['/financials/retention', 'Revenue retention', true], ['/financials/customers', 'Customers', true]]
const on = (to: string) => (to.includes('?') ? route.fullPath === to : route.path === to && !route.query.tab)
</script>
<template><nav class="ft"><NuxtLink v-for="[to, l, paid] in T" :key="to" :to="to" :class="{ on: on(to) }">{{ l }}<svg v-if="paid && locked" class="lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Upgrade to unlock"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></NuxtLink></nav></template>
<style scoped>
.ft { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 0 0 16px; overflow-x: auto; } .ft a { display: flex; align-items: center; gap: 5px; padding: 10px 0; font-size: 14px; color: var(--c-muted); text-decoration: none; border-bottom: 2px solid transparent; white-space: nowrap; } .ft a.on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .ft a:hover { color: var(--c-ink); }
.lk { width: 12px; height: 12px; color: var(--c-muted); }
</style>
