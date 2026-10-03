<script setup lang="ts">
const route = useRoute()
const arm = computed(() => (route.meta.brand as string | undefined) ?? 'Ventures')
const foot = computed(() => (route.meta.foot as string | undefined) ?? 'Aidi Ventures · Part of The Aidi Group · Your figures are shared only with the Aidi Ventures team.')
</script>

<template>
  <div class="pub">
    <header class="pub-top"><span class="pub-mark" aria-label="Aidi"><AidiWordmark /></span><span class="pub-div" /><span class="pub-arm">{{ arm }}</span></header>
    <main class="pub-main"><slot /></main>
    <footer class="pub-foot">{{ foot }}</footer>
  </div>
</template>

<style scoped>
.pub { min-height: 100vh; background: #fff; display: flex; flex-direction: column; }
.pub-top { display: flex; align-items: center; gap: 12px; padding: 22px 32px; border-bottom: 1px solid var(--c-rule); color: var(--c-navy); }
.pub-mark { display: flex; width: 58px; height: 23px; } .pub-mark :deep(svg) { width: 100%; height: 100%; display: block; }
.pub-div { width: 1px; height: 18px; background: var(--c-rule-strong); }
.pub-arm { font-family: var(--font-heading); font-style: italic; font-size: 1.2rem; }
.pub-main { flex: 1; padding: 48px 24px; }
.pub-foot { padding: 20px 32px; border-top: 1px solid var(--c-rule); font-size: 12px; color: var(--c-muted); }
</style>
