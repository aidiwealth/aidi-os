<script setup lang="ts">
// An investor's personal link to an update.
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
const nda = ref(String(useRoute().query.nda ?? ''))
const goNda = (id: string) => { const u = new URL(window.location.href); u.searchParams.set('nda', id); window.location.replace(u.toString()) }
const { data, error, refresh } = await useFetch<{ gated?: boolean; nda?: { required: boolean; text: string; key: string }; html: string; title: string; body: string; label: string; company: string; page: string | null; figures: { currency: string; current: Record<string, number | null> | null; previous: Record<string, number | null> | null } }>(() => '/api/public/u/' + token + (nda.value ? '?nda=' + encodeURIComponent(nda.value) : ''), { key: 'pub-u-' + token + (nda.value ? '-' + nda.value : '') })
onMounted(() => { const k = data.value?.nda?.key; if (data.value?.gated && k) { const s = localStorage.getItem('finvry-nda-' + k); if (s && s !== nda.value) goNda(s) } })
useHead({ titleTemplate: '%s', title: () => data.value?.title ?? 'Investor update', meta: [{ name: 'robots', content: 'noindex' }] })
</script>
<template>
  <section class="wrap">
    <NdaGate v-if="data && data.gated && data.nda" :company="data.company" :text="data.nda.text" kind="update" :ref-key="token" :org-key="data.nda.key" @signed="goNda" />
    <div v-else-if="error" class="card"><h1>This link is not valid</h1></div>
    <template v-else-if="data"><UpdateView :html="data.html" :title="data.title" :label="data.label" :body="data.body" :company="data.company" :currency="data.figures.currency" :current="data.figures.current" :previous="data.figures.previous" />
      <ClientOnly><UpdateReact :token="token" :company="data.company" /></ClientOnly>
      <p v-if="data.page" class="more"><NuxtLink :to="'/c/' + data.page">See {{ data.company }}'s investor page →</NuxtLink></p></template>
  </section>
</template>
<style scoped>.wrap { max-width: 860px; margin: 0 auto; } .more { margin-top: 24px; }</style>
