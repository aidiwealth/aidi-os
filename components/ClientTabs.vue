<script setup lang="ts">
// Tabs across the Services pages when they are shown inside the Finvry app (the portal frame has its own top bar).
const route = useRoute()
const tabs = [{ to: '/client', label: 'Overview' }, { to: '/client/documents', label: 'Documents' }, { to: '/client/invoices', label: 'Invoices & payments' }, { to: '/client/messages', label: 'Messages' }]
const on = (to: string) => (to === '/client' ? route.path === '/client' || route.path.startsWith('/client/jobs') : route.path.startsWith(to))
</script>
<template>
  <nav class="ct"><NuxtLink v-for="t in tabs" :key="t.to" :to="t.to" :class="{ on: on(t.to) }">{{ t.label }}</NuxtLink></nav>
</template>
<style scoped>
.ct { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin-bottom: 18px; } .ct a { padding: 10px 0; color: var(--c-muted); text-decoration: none; font-size: 14px; border-bottom: 2px solid transparent; } .ct a.on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
</style>
