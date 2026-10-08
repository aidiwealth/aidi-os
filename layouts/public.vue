<script setup lang="ts">
// Founder and client links. The workspace's own name in the header and footer; Aidi's workspace keeps the Aidi look.
interface WS { name: string; firm: string; brand: 'aidi' | 'finvry' }
const route = useRoute()
const brand = useBrand()
const token = route.params.handle ? (route.params.link ? '@' + String(route.params.handle) + '.' + String(route.params.link) : String(route.params.handle)) : String(route.params.token ?? route.params.slug ?? '')
const kind = route.params.handle ? (route.params.link ? 'd' : 'c') : route.path.startsWith('/job/') ? 'job' : route.path.startsWith('/report/') ? 'report' : route.path.startsWith('/pay/') ? 'pay' : route.path.startsWith('/lp/') ? 'lp' : route.path.startsWith('/bill/') ? 'bill' : route.path.startsWith('/info/') ? 'info' : route.path.startsWith('/formation/') ? 'formation' : route.path.startsWith('/share/') ? 'share' : route.path.startsWith('/c/') ? 'c' : route.path.startsWith('/u/') ? 'u' : route.path.startsWith('/d/') ? 'd' : ''
const { data } = await useFetch<{ workspace?: WS; branding?: { logo_url: string | null; bg: string | null; fg: string | null; hide_finvry: boolean } }>('/api/public/' + (kind || 'none') + '/' + token, { key: 'pub-' + kind + '-' + token, immediate: !!kind })
const ws = computed(() => data.value?.workspace ?? null)
const br = computed(() => data.value?.branding ?? null)
const dark = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 140 }
const accent = computed(() => (br.value?.bg && dark(br.value.bg) ? { '--c-navy': br.value.bg } : undefined))
const band = computed(() => (br.value?.bg || br.value?.fg ? { background: br.value.bg ?? undefined, color: br.value.fg ?? undefined, borderColor: 'transparent' } : undefined))
const aidiLook = computed(() => (ws.value ? ws.value.brand === 'aidi' : brand.key === 'aidi'))
const title = computed(() => (ws.value ? (['report', 'lp', 'bill', 'info', 'formation', 'share'].includes(kind) ? ws.value.firm : ws.value.name) : ''))
const foot = computed(() => {
  if (!ws.value) return kind === 'job' ? 'Your details and documents are shared only with the team handling your request.' : 'Your figures are shared only with the team that requested them.'
  const t = kind === 'c' || kind === 'u' || kind === 'd' ? 'Shared by ' + ws.value.name + '.' : kind === 'info' ? 'Your answers and documents are shared only with the team preparing your filings.' : kind === 'formation' ? 'Card payments are processed by Stripe; card details never reach us.' : kind === 'bill' ? 'Card payments are processed by Stripe or Paystack; card details never reach us.' : kind === 'lp' ? 'This information is confidential to you as an investor.' : kind === 'pay' ? 'Payments are processed securely by Stripe or Paystack; card details never reach us.' : kind === 'job' ? 'Your details and documents are shared only with the team handling your request.' : 'Your figures are shared only with the ' + ws.value.firm + ' team.'
  return title.value + ' · ' + t + (ws.value.brand === 'finvry' && !br.value?.hide_finvry ? ' · Powered by Finvry' : '')
})
</script>

<template>
  <div class="pub" :style="accent">
    <header class="pub-top" :style="band">
      <template v-if="aidiLook"><span class="pub-mark" aria-label="Aidi"><AidiWordmark /></span><span class="pub-div" /><span class="pub-arm">{{ ['report', 'lp', 'bill', 'info', 'formation', 'share'].includes(kind) ? 'Ventures' : 'Group' }}</span></template>
      <img v-else-if="br?.logo_url" :src="br.logo_url" :alt="title" class="pub-logo">
      <span v-else-if="title" class="pub-name">{{ title }}</span>
      <a v-else :href="brand.key === 'finvry' ? 'https://finvry.com' : 'https://theaidigroup.com'" class="pub-home" aria-label="Home"><BrandMark /></a>
    </header>
    <main class="pub-main"><slot /></main>
    <footer class="pub-foot" :style="band">{{ foot }}</footer>
  </div>
</template>

<style scoped>
.pub { min-height: var(--vh100); background: #fff; display: flex; flex-direction: column; }
.pub-top { display: flex; align-items: center; gap: 12px; padding: 22px 32px; border-bottom: 1px solid var(--c-rule); color: var(--c-navy); }
.pub-mark { display: flex; width: 58px; height: 23px; } .pub-mark :deep(svg) { width: 100%; height: 100%; display: block; }
.pub-div { width: 1px; height: 18px; background: var(--c-rule-strong); }
.pub-arm { font-family: var(--font-serif); font-style: italic; font-size: 1.2rem; }
.pub-logo { max-height: 36px; max-width: 200px; } .pub-top .pub-name { color: inherit; }
.pub-name { font-family: var(--font-serif); font-weight: 500; font-size: 1.5rem; letter-spacing: -0.01em; }
.pub-main { flex: 1; padding: 48px 24px; }
.pub-foot { padding: 20px 32px; border-top: 1px solid var(--c-rule); font-size: 12px; color: var(--c-muted); }
.pub-home { display: inline-flex; text-decoration: none; color: inherit; }
</style>
