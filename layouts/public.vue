<script setup lang="ts">
// Founder and client links. The workspace's own name in the header and footer; Aidi's workspace keeps the Aidi look.
interface WS { name: string; firm: string; brand: 'aidi' | 'finvry' }
const route = useRoute()
const brand = useBrand()
const token = String(route.params.token ?? '')
const kind = route.path.startsWith('/job/') ? 'job' : route.path.startsWith('/report/') ? 'report' : ''
const { data } = await useFetch<{ workspace?: WS }>('/api/public/' + (kind || 'none') + '/' + token, { key: 'pub-' + kind + '-' + token, immediate: !!kind })
const ws = computed(() => data.value?.workspace ?? null)
const aidiLook = computed(() => (ws.value ? ws.value.brand === 'aidi' : brand.key === 'aidi'))
const title = computed(() => (ws.value ? (kind === 'job' ? ws.value.name : ws.value.firm) : ''))
const foot = computed(() => {
  if (!ws.value) return kind === 'job' ? 'Your details and documents are shared only with the team handling your request.' : 'Your figures are shared only with the team that requested them.'
  const t = kind === 'job' ? 'Your details and documents are shared only with the team handling your request.' : 'Your figures are shared only with the ' + ws.value.firm + ' team.'
  return title.value + ' · ' + t + (ws.value.brand === 'finvry' ? ' · Powered by Finvry' : '')
})
</script>

<template>
  <div class="pub">
    <header class="pub-top">
      <template v-if="aidiLook"><span class="pub-mark" aria-label="Aidi"><AidiWordmark /></span><span class="pub-div" /><span class="pub-arm">{{ kind === 'job' ? 'Group' : 'Ventures' }}</span></template>
      <span v-else-if="title" class="pub-name">{{ title }}</span>
      <BrandMark v-else />
    </header>
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
.pub-name { font-family: var(--font-heading); font-weight: 500; font-size: 1.5rem; letter-spacing: -0.01em; }
.pub-main { flex: 1; padding: 48px 24px; }
.pub-foot { padding: 20px 32px; border-top: 1px solid var(--c-rule); font-size: 12px; color: var(--c-muted); }
</style>
