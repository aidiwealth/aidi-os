<script setup lang="ts">
// Public deck link: email gate, then the slide viewer (time per slide is recorded for the company).
definePageMeta({ layout: false })
const token = useRoute().params.token as string
const { data, error } = await useFetch<{ title: string; require_email: boolean; allow_download: boolean; workspace: { firm: string }; branding: { logo_url: string | null } | null }>('/api/public/deck/' + token, { key: 'deck-' + token })
useHead({ title: () => (data.value ? data.value.title + ' — ' + data.value.workspace.firm : 'Deck'), meta: [{ name: 'robots', content: 'noindex' }] })
const visit = ref(''); const email = ref(''); const name = ref(''); const msg = ref(''); const busy = ref(false)
async function start() { busy.value = true; msg.value = ''; try { visit.value = (await $fetch<{ visit: string }>('/api/public/deck/' + token + '/start', { method: 'POST', body: { email: email.value, name: name.value } })).visit } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open the deck.' } finally { busy.value = false } }
onMounted(() => { if (data.value && !data.value.require_email) start() })
function track(page: number, seconds: number, pages: number) { const body = JSON.stringify({ visit: visit.value, page, seconds, pages }); if (navigator.sendBeacon) navigator.sendBeacon('/api/public/deck/' + token + '/track', new Blob([body], { type: 'application/json' })); else $fetch('/api/public/deck/' + token + '/track', { method: 'POST', body }).catch(() => {}) }
</script>
<template>
  <div class="dk">
    <header><img v-if="data?.branding?.logo_url" :src="data.branding.logo_url" alt="" class="lg"><b>{{ data?.workspace.firm }}</b><span>{{ data?.title }}</span><a v-if="visit && data?.allow_download" :href="'/api/public/deck/' + token + '/file?download=1&v=' + visit" class="dl">Download</a></header>
    <main>
      <div v-if="error" class="card gate"><h1>This link is not valid</h1><p class="mut">Ask the company for a new link.</p></div>
      <form v-else-if="data && !visit && data.require_email" class="card gate" @submit.prevent="start"><h1>{{ data.title }}</h1><p class="mut">{{ data.workspace.firm }} shares this deck with investors. Enter your email to view it.</p>
        <input v-model="email" type="email" required placeholder="you@fund.com" autocomplete="email"><input v-model="name" maxlength="120" placeholder="Your name (optional)" autocomplete="name"><button class="btn" :disabled="busy">{{ busy ? 'Opening…' : 'View deck' }}</button><p v-if="msg" class="error">{{ msg }}</p></form>
      <ClientOnly v-else-if="visit"><DeckViewer :src="'/api/public/deck/' + token + '/file?v=' + visit" :on-track="track" /></ClientOnly>
    </main>
  </div>
</template>
<style scoped>
.dk { min-height: 100vh; background: #f2f1ec; font-family: var(--font-body); color: var(--c-ink); } header { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: #fff; border-bottom: 1px solid var(--c-rule); font-size: 14px; } header span { color: var(--c-muted); } .lg { height: 26px; } .dl { margin-left: auto; color: var(--c-blue-deep); text-decoration: none; }
main { padding: 24px 16px; display: flex; justify-content: center; } .gate { max-width: 420px; width: 100%; display: flex; flex-direction: column; gap: 10px; margin-top: 8vh; } .gate h1 { margin: 0; font-size: 22px; } .gate input { font: inherit; font-size: 14px; padding: 10px 12px; border: 1px solid var(--c-rule-strong); } .mut { color: var(--c-muted); font-size: 13.5px; margin: 0; } .error { color: var(--c-danger); margin: 0; }
</style>
