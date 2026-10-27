<script setup lang="ts">
// The Public Markets sub-menu: markets (valuations), accounts, and trades with what is waiting.
const props = defineProps<{ waiting?: number }>()
const route = useRoute()
const on = (p: string) => (p === '/markets' ? route.path === '/markets' || (/^\/markets\/[^/]+$/.test(route.path) && !['/markets/accounts', '/markets/trades', '/markets/assumptions'].includes(route.path)) : route.path.startsWith(p))
</script>
<template>
  <nav class="mn" aria-label="Public markets">
    <NuxtLink to="/markets" :class="{ on: on('/markets') }">Markets</NuxtLink>
    <NuxtLink to="/markets/accounts" :class="{ on: on('/markets/accounts') }">Accounts</NuxtLink>
    <NuxtLink to="/markets/trades" :class="{ on: on('/markets/trades') }">Trades<em v-if="props.waiting">{{ props.waiting }}</em></NuxtLink>
    <NuxtLink to="/markets/assumptions" :class="{ on: on('/markets/assumptions') }">Assumptions</NuxtLink>
  </nav>
</template>
<style scoped>
.mn { display: inline-flex; gap: 2px; background: var(--c-paper-2); padding: 3px; align-self: flex-start; flex-wrap: wrap; }
.mn a { font-size: 13.5px; padding: 6px 14px; color: var(--c-ink-soft); text-decoration: none; } .mn a.on { background: #fff; color: var(--c-ink); font-weight: 500; }
.mn em { font-style: normal; margin-left: 6px; font-size: 11.5px; background: var(--c-blue-deep); color: #fff; padding: 1px 6px; }
</style>
