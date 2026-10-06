<script setup lang="ts">
// A published update on a company's investor page.
definePageMeta({ layout: 'public' })
const r = useRoute(); const slug = r.params.slug as string, id = r.params.id as string
const nda = ref(String(useRoute().query.nda ?? ''))
const goNda = (id: string) => { const u = new URL(window.location.href); u.searchParams.set('nda', id); window.location.replace(u.toString()) }
const { data, error, refresh } = await useFetch<{ gated?: boolean; nda?: { required: boolean; text: string; key: string }; html: string; title: string; body: string; label: string; company: string; figures: { currency: string; current: Record<string, number | null> | null; previous: Record<string, number | null> | null } }>(() => '/api/public/c/' + slug + '/updates/' + id + (nda.value ? '?nda=' + encodeURIComponent(nda.value) : ''), { key: 'pub-cu-' + id + (nda.value ? '-' + nda.value : '') })
onMounted(() => { const k = data.value?.nda?.key; if (data.value?.gated && k) { const s = localStorage.getItem('finvry-nda-' + k); if (s && s !== nda.value) goNda(s) } })
useHead({ titleTemplate: '%s', title: () => data.value?.title ?? 'Investor update' })
</script>
<template>
  <section class="wrap"><NuxtLink :to="'/c/' + slug" class="back">← Investor relations</NuxtLink>
    <NdaGate v-if="data && data.gated && data.nda" :company="data.company" :text="data.nda.text" kind="update" :ref-key="slug" :org-key="data.nda.key" @signed="goNda" />
    <div v-else-if="error" class="card"><h1>Not found</h1></div>
    <UpdateView :html="data.html" v-else-if="data" :title="data.title" :label="data.label" :body="data.body" :company="data.company" :currency="data.figures.currency" :current="data.figures.current" :previous="data.figures.previous" /></section>
</template>
<style scoped>.wrap { max-width: 860px; margin: 0 auto; } .back { display: inline-block; margin-bottom: 14px; color: var(--c-muted); }</style>
