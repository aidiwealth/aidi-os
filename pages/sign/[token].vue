<script setup lang="ts">
// Sign an equity document (SAFE, option grant, share purchase, board consent) from a private link. No account needed.
import type { SignValue } from '~/components/AgreementSign.vue'
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
interface D { company: string; title: string; kind: string; status: string; docs: { title: string; md: string }[]; me: { name: string; email: string; role: string; title: string | null; signed_at: string | null }; signers: { name: string; role: string; title: string | null; signed_at: string | null }[] }
const { data, error, refresh } = await useFetch<D>('/api/public/sign/' + token)
useHead({ title: () => (data.value ? 'Sign: ' + data.value.title : 'Sign'), meta: [{ name: 'robots', content: 'noindex' }] })
const sv = ref<SignValue>({ name: data.value?.me.name ?? '', kind: 'typed', png: '', agree: false })
const busy = ref(false), msg = ref(''), done = ref<'' | 'signed' | 'complete'>('')
const ROLE: Record<string, string> = { company: 'For the company', holder: 'Holder', director: 'Director' }
const KIND: Record<string, string> = { safe: 'SAFE', grant: 'Equity grant', purchase: 'Stock purchase', consent: 'Board consent' }
async function sign() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ complete?: boolean }>('/api/public/sign/' + token, { method: 'POST', body: sv.value }); done.value = r.complete ? 'complete' : 'signed'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not sign. Try again.' } finally { busy.value = false }
}
const errMsg = computed(() => (error.value?.data as { data?: { error?: { message?: string } } } | undefined)?.data?.error?.message ?? 'It may have been replaced by a newer link; check your email.')
const ready = computed(() => sv.value.name.trim().length > 1 && !!sv.value.png && sv.value.agree)
</script>
<template>
  <section class="sg">
    <div v-if="error" class="card"><h1>This link is not valid</h1><p class="muted">{{ errMsg }}</p></div>
    <template v-else-if="data">
      <p class="label">{{ data.company }} · {{ KIND[data.kind] ?? 'Document' }}</p><h1>{{ data.title }}</h1>
      <div class="who"><span v-for="(s, i) in data.signers" :key="i" :class="{ ok: s.signed_at }"><b>{{ s.name }}</b><em>{{ ROLE[s.role] }}{{ s.title ? ', ' + s.title : '' }} · {{ s.signed_at ? 'Signed' : 'Waiting' }}</em></span></div>
      <div v-if="data.status === 'void'" class="card"><p>This document was withdrawn by {{ data.company }}. Nothing more to do.</p></div>
      <div v-else-if="data.me.signed_at || done" class="card done"><h2>{{ data.status === 'signed' ? 'Signed by everyone' : 'You have signed' }}</h2><p class="muted">{{ data.status === 'signed' ? 'The signed copy, with its signature certificate, is on its way to your email.' : 'We will email you the signed copy once everyone has signed.' }}</p></div>
      <template v-else-if="data.status === 'sent'">
        <p class="muted">Signing as <b>{{ data.me.name }}</b> ({{ data.me.email }}){{ data.me.title ? ', ' + data.me.title : '' }}. Read the document, then sign below.</p>
        <ClientOnly><AgreementSign v-model="sv" :title="data.title" md="" :docs="data.docs" /></ClientOnly>
        <div class="act"><button class="btn" :disabled="busy || !ready" @click="sign">{{ busy ? 'Signing…' : 'Sign' }}</button><span class="muted">Your signature is recorded with the time, your IP address and device, as required for electronic signatures (E-SIGN Act).</span></div>
        <p v-if="msg" class="error">{{ msg }}</p>
      </template>
      <div v-else class="card"><p>This document is complete.</p></div>
    </template>
  </section>
</template>
<style scoped>
.sg { max-width: 860px; margin: 0 auto; padding: 32px clamp(16px, 4vw, 32px) 64px; display: flex; flex-direction: column; gap: 14px; } .sg h1 { margin: 0; font-size: 30px; }
.who { display: flex; flex-wrap: wrap; gap: 8px; } .who span { border: 1px solid var(--c-rule); padding: 8px 12px; display: flex; flex-direction: column; font-size: 13px; background: #fff; } .who b { font-weight: 600; } .who em { font-style: normal; color: var(--c-muted); font-size: 12px; } .who .ok em { color: var(--c-ink-soft); }
.muted { color: var(--c-muted); font-size: 13.5px; margin: 0; } .act { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; } .act .muted { font-size: 12.5px; flex: 1; min-width: 240px; } .error { color: var(--c-danger); margin: 0; }
.done h2 { margin: 0 0 4px; font-size: 18px; }
</style>
