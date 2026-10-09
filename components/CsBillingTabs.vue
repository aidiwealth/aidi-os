<script setup lang="ts">
// Billing on the services desk: invoices, invoices by job (and jobs not yet invoiced), and client wallets (Finvry console).
const route = useRoute()
const { data: me } = await useFetch<{ platform: boolean }>('/api/auth/me', { key: 'me' })
const tabs = computed(() => [{ to: '/services/invoices', label: 'Invoices' }, { to: '/services/invoices/jobs', label: 'By job' }, ...(me.value?.platform ? [{ to: '/platform/finance', label: 'Client wallets' }] : [])])
const on = (to: string) => (to === '/services/invoices' ? route.path === '/services/invoices' || /^\/services\/invoices\/[0-9a-f-]{36}$/.test(route.path) : route.path.startsWith(to))
</script>
<template><nav class="cbt"><NuxtLink v-for="t in tabs" :key="t.to" :to="t.to" :class="{ on: on(t.to) }">{{ t.label }}</NuxtLink></nav></template>
<style scoped>
.cbt { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; width: fit-content; margin: -6px 0 16px; } .cbt a { padding: 6px 14px; font-size: 13.5px; color: var(--c-ink-soft); text-decoration: none; } .cbt a.on { background: #fff; color: var(--c-navy); font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); }
</style>
