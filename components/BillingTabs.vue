<script setup lang="ts">
// Billing for a company: invoices, the service jobs they pay for, and the wallet they can pay from.
const route = useRoute()
const { canPath } = useModuleAccess()
const tabs = computed(() => [{ to: '/client/invoices', label: 'Invoices' }, { to: '/client/jobs', label: 'Service jobs' }, { to: '/wallet', label: 'Wallet' }].filter((t) => canPath(t.to)))
// In the Finvry app the menu's sub-menu covers these pages; these tabs show only where it does not (the portal).
const wsTabs = inject<Ref<unknown[] | null> | null>('wsTabs', null)
const covered = computed(() => !!wsTabs?.value?.length)
</script>
<template><nav v-if="!covered" class="bt"><NuxtLink v-for="t in tabs" :key="t.to" :to="t.to" :class="{ on: route.path === t.to }">{{ t.label }}</NuxtLink></nav></template>
<style scoped>
.bt { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; width: fit-content; margin: 0 0 16px; } .bt a { padding: 6px 14px; font-size: 13.5px; color: var(--c-ink-soft); text-decoration: none; } .bt a.on { background: #fff; color: var(--c-navy); font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); }
</style>
