<script setup lang="ts">
// Tabs for Investor relations: updates and the public investor page.
const route = useRoute()
const { data: mods } = await useFetch<{ code: string; usable: boolean }[]>('/api/modules', { key: 'modules' })
const has = (c: string) => (mods.value ?? []).some((m) => m.code === c && m.usable)
const TABS = [{ to: '/updates', label: 'Investor updates', code: 'updates' }, { to: '/investor-page', label: 'Investor page', code: 'investor_page' }]
</script>
<template>
  <nav class="it" aria-label="Investor relations"><NuxtLink v-for="t in TABS" :key="t.to" :to="t.to" :class="{ on: route.path === t.to || route.path.startsWith(t.to + '/'), off: !has(t.code) }">{{ t.label }}<svg v-if="!has(t.code)" viewBox="0 0 24 24" aria-label="Upgrade to unlock"><rect x="5" y="11" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></NuxtLink></nav>
</template>
<style scoped>
.it { display: flex; gap: 2px; border-bottom: 1px solid var(--c-rule); margin: 4px 0 18px; } .it a { display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px; text-decoration: none; color: var(--c-muted); font-size: 14px; font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.it a:hover { color: var(--c-ink); } .it a.on { color: var(--c-ink); border-bottom-color: var(--c-navy); } .it a.off { opacity: .7; } .it svg { width: 13px; height: 13px; }
</style>
