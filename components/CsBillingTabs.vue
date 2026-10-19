<script setup lang="ts">
// In the Finvry console the sub-menu at the top of the page replaces these tabs.
const inConsoleRef = inject<Ref<boolean> | null>('inConsole', null)
const inConsole = computed(() => !!inConsoleRef?.value)
// Billing on Finvry Services: invoices, invoices by job (and jobs not yet invoiced) and payments received. Services only.
const route = useRoute()
const { canPath } = useModuleAccess()
const tabs = computed(() => [{ to: '/services/invoices', label: 'Invoices' }, { to: '/services/invoices/jobs', label: 'By job' }, { to: '/services/invoices/payments', label: 'Payments received' }].filter((t) => canPath(t.to)))
const on = (to: string) => (to === '/services/invoices' ? route.path === '/services/invoices' || /^\/services\/invoices\/[0-9a-f-]{36}$/.test(route.path) : route.path.startsWith(to))
</script>
<template><nav v-if="!inConsole" class="cbt"><NuxtLink v-for="t in tabs" :key="t.to" :to="t.to" :class="{ on: on(t.to) }">{{ t.label }}</NuxtLink></nav></template>
<style scoped>
.cbt { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; width: fit-content; margin: -6px 0 16px; } .cbt a { padding: 6px 14px; font-size: 13.5px; color: var(--c-ink-soft); text-decoration: none; } .cbt a.on { background: #fff; color: var(--c-navy); font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); }
</style>
