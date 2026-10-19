<script setup lang="ts">
// In the Finvry console the sub-menu at the top of the page replaces these tabs.
const inConsoleRef = inject<Ref<boolean> | null>('inConsole', null)
const inConsole = computed(() => !!inConsoleRef?.value)
const route = useRoute()
const { canPath } = useModuleAccess()
const tabs = computed(() => [{ to: '/services', label: 'Jobs' }, { to: '/services/clients', label: 'Clients' }, { to: '/services/invoices', label: 'Invoices & payments' }, { to: '/services/agreements', label: 'Agreements' }, { to: '/services/settings', label: 'Prices & settings' }].filter((t) => canPath(t.to)))
const on = (to: string) => (to === '/services' ? route.path === '/services' || /^\/services\/[0-9a-f-]{36}$/.test(route.path) : route.path.startsWith(to))
</script>
<template><nav v-if="!inConsole" class="csnav"><NuxtLink v-for="t in tabs" :key="t.to" :to="t.to" :class="{ on: on(t.to) }">{{ t.label }}</NuxtLink></nav></template>
<style scoped>
.csnav { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: -6px 0 20px; }
.csnav a { padding: 8px 2px; color: var(--c-muted); border-bottom: 2px solid transparent; margin-bottom: -1px; text-decoration: none; font-size: 14px; }
.csnav a.on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
</style>
