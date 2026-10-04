<script setup lang="ts">
// A published update on a company's investor page.
definePageMeta({ layout: 'public' })
const r = useRoute(); const slug = r.params.slug as string, id = r.params.id as string
const { data, error } = await useFetch<{ html: string; title: string; body: string; label: string; company: string; figures: { currency: string; current: Record<string, number | null> | null; previous: Record<string, number | null> | null } }>('/api/public/c/' + slug + '/updates/' + id, { key: 'pub-cu-' + id })
useHead({ titleTemplate: '%s', title: () => data.value?.title ?? 'Investor update' })
</script>
<template>
  <section class="wrap"><NuxtLink :to="'/c/' + slug" class="back">← Investor relations</NuxtLink>
    <div v-if="error" class="card"><h1>Not found</h1></div>
    <UpdateView :html="data.html" v-else-if="data" :title="data.title" :label="data.label" :body="data.body" :company="data.company" :currency="data.figures.currency" :current="data.figures.current" :previous="data.figures.previous" /></section>
</template>
<style scoped>.wrap { max-width: 860px; margin: 0 auto; } .back { display: inline-block; margin-bottom: 14px; color: var(--c-muted); }</style>
