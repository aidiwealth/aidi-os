<script setup lang="ts">
// An investor's personal link to an update.
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
const { data, error } = await useFetch<{ html: string; title: string; body: string; label: string; company: string; page: string | null; figures: { currency: string; current: Record<string, number | null> | null; previous: Record<string, number | null> | null } }>('/api/public/u/' + token, { key: 'pub-u-' + token })
useHead({ titleTemplate: '%s', title: () => data.value?.title ?? 'Investor update', meta: [{ name: 'robots', content: 'noindex' }] })
</script>
<template>
  <section class="wrap">
    <div v-if="error" class="card"><h1>This link is not valid</h1></div>
    <template v-else-if="data"><UpdateView :html="data.html" :title="data.title" :label="data.label" :body="data.body" :company="data.company" :currency="data.figures.currency" :current="data.figures.current" :previous="data.figures.previous" />
      <p v-if="data.page" class="more"><NuxtLink :to="'/c/' + data.page">See {{ data.company }}'s investor page →</NuxtLink></p></template>
  </section>
</template>
<style scoped>.wrap { max-width: 860px; margin: 0 auto; } .more { margin-top: 24px; }</style>
