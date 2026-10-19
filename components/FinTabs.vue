<script setup lang="ts">
// Financials sub-menu for the company or group being viewed (?s= is kept on every link). The group has its
// consolidation; a company its sharing links. Revenue retention and Customers are paid (a lock on the free plan).
const props = defineProps<{ s: string; group: boolean; company: boolean }>()
const route = useRoute()
const { data: mods } = useNuxtData<{ code: string; locked?: boolean }[]>('modules')
const locked = computed(() => !!mods.value?.find((m) => m.code === 'fin_customers' && m.locked))
const q = (extra: Record<string, string> = {}) => ({ s: props.s, ...extra })
const T = computed(() => [
  { to: { path: '/financials', query: q() }, l: 'Overview', on: route.path === '/financials' && !route.query.tab, paid: false },
  { to: { path: '/financials', query: q({ tab: 'statements' }) }, l: 'Statements', on: route.path === '/financials' && route.query.tab === 'statements', paid: false },
  ...(props.group ? [{ to: { path: '/financials', query: q({ tab: 'consolidation' }) }, l: 'Consolidation', on: route.path === '/financials' && route.query.tab === 'consolidation', paid: false }]
    : [{ to: { path: '/financials', query: q({ tab: 'shares' }) }, l: 'Sharing', on: route.path === '/financials' && route.query.tab === 'shares', paid: false }]),
  ...(props.company ? [{ to: { path: '/financials/retention', query: q() }, l: 'Revenue retention', on: route.path === '/financials/retention', paid: true },
    { to: { path: '/financials/customers', query: q() }, l: 'Customers', on: route.path === '/financials/customers', paid: true }] : []),
  { to: { path: '/financials/next', query: q() }, l: 'What to do next', on: route.path === '/financials/next', paid: false },
  { to: { path: '/financials', query: q({ tab: 'reports' }) }, l: 'Reports', on: route.path === '/financials' && route.query.tab === 'reports', paid: false }])
</script>
<template><nav class="ft"><NuxtLink v-for="t in T" :key="t.l" :to="t.to" :class="{ on: t.on }">{{ t.l }}<svg v-if="t.paid && locked" class="lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Upgrade to unlock"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></NuxtLink></nav></template>
<style scoped>
.ft { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 0 0 18px; overflow-x: auto; } .ft a { display: flex; align-items: center; gap: 5px; padding: 10px 0; font-size: 14px; color: var(--c-muted); text-decoration: none; border-bottom: 2px solid transparent; white-space: nowrap; } .ft a.on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .ft a:hover { color: var(--c-ink); }
.lk { width: 12px; height: 12px; color: var(--c-muted); }
</style>
