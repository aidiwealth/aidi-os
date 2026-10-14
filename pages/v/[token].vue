<script setup lang="ts">
// A forecast or cap table shared with a private link. Asks for an email first when the company wants to know who
// opened it; time on the page is recorded.
import type { Assumptions } from '~/shared/forecast'
import type { Data } from '~/shared/captable'
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
const { data: meta, error } = await useFetch<{ kind: 'forecast' | 'captable'; title: string; company: string; logo: string | null; require_email: boolean }>('/api/public/v/' + token)
useHead({ title: () => (meta.value ? meta.value.company + ' · ' + meta.value.title : 'Shared link'), meta: [{ name: 'robots', content: 'noindex' }] })
const email = ref(''), name = ref(''), busy = ref(false), msg = ref('')
const view = ref<{ view_id: string; forecast?: { name: string; assumptions: Assumptions; updated_at: string }; captable?: { name: string; data: Data } } | null>(null)
async function open() {
  busy.value = true; msg.value = ''
  try { view.value = await $fetch('/api/public/v/' + token + '/open', { method: 'POST', body: { email: email.value, name: name.value } }); try { localStorage.setItem('fv_email', email.value); localStorage.setItem('fv_name', name.value) } catch {} }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open this link.' } finally { busy.value = false }
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  try { email.value = localStorage.getItem('fv_email') ?? ''; name.value = localStorage.getItem('fv_name') ?? '' } catch {}
  if (meta.value && !meta.value.require_email) open()
  timer = setInterval(() => { if (view.value && document.visibilityState === 'visible') $fetch('/api/public/v/' + token + '/beat', { method: 'POST', body: { view_id: view.value.view_id } }).catch(() => {}) }, 15000)
})
onBeforeUnmount(() => clearInterval(timer))
const updated = computed(() => (view.value?.forecast?.updated_at ? new Date(view.value.forecast.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''))
</script>
<template>
  <section class="wrap pv">
    <div v-if="error" class="card gate"><h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1><p class="muted">Ask the company for a new link.</p></div>
    <template v-else-if="meta">
      <div class="hd"><img v-if="meta.logo" :src="meta.logo" :alt="meta.company" class="lg"><div><p class="label">{{ meta.company }} · {{ meta.kind === 'forecast' ? 'Financial forecast' : 'Cap table' }}</p><h1>{{ meta.title }}</h1></div></div>
      <form v-if="!view" class="card gate" @submit.prevent="open"><h2>{{ meta.require_email ? 'Enter your email to view' : 'Opening…' }}</h2>
        <template v-if="meta.require_email"><p class="muted">{{ meta.company }} will see that you opened this.</p><label>Your name<input v-model="name" maxlength="200" autocomplete="name"></label><label>Email<input v-model="email" type="email" required maxlength="254" autocomplete="email"></label><button class="btn" :disabled="busy">{{ busy ? 'Opening…' : 'View ' + (meta.kind === 'forecast' ? 'forecast' : 'cap table') }}</button></template>
        <p v-if="msg" class="error">{{ msg }}</p></form>
      <template v-else-if="view.forecast"><ForecastSummary :assumptions="view.forecast.assumptions" /><p class="foot muted">A forecast is an estimate from the company's assumptions, not a promise of results. Last updated {{ updated }}.</p></template>
      <template v-else-if="view.captable"><CapTableSummary :data="view.captable.data" /><p class="foot muted">As recorded by {{ meta.company }}. Confidential: please do not forward.</p></template>
    </template>
  </section>
</template>
<style scoped>
.pv { max-width: 1240px; margin: 0 auto; padding: 32px clamp(16px, 4vw, 40px) 64px; display: flex; flex-direction: column; gap: 18px; min-width: 0; } .pv > * { min-width: 0; max-width: 100%; }
.hd { display: flex; gap: 16px; align-items: center; } .hd h1 { margin: 2px 0 0; } .lg { width: 52px; height: 52px; object-fit: contain; border: 1px solid var(--c-rule); background: #fff; }
.gate { max-width: 440px; display: flex; flex-direction: column; gap: 12px; } .gate h2 { margin: 0; font-size: 18px; } .gate label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } .gate input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); }
.muted { color: var(--c-muted); margin: 0; } .foot { font-size: 12.5px; } .error { color: var(--c-danger); margin: 0; }
</style>
