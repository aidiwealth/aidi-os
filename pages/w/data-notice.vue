<script setup lang="ts">
// The data protection notice for the client's country: what we keep, what the AI reads, what we never collect.
import { mdRender } from '~/shared/markdown'
definePageMeta({ layout: false })
useHead({ title: 'Data protection notice · Aidi Wealth' })
const { data, error } = await useFetch<{ title: string; md: string }>('/api/w/data-notice')
</script>
<template>
  <div class="dn">
    <header class="top"><b>Aidi Wealth</b><NuxtLink to="/w/start" class="lk">← Back</NuxtLink></header>
    <p v-if="error" class="pad">We couldn't load the notice. Please sign in again.</p>
    <article v-else-if="data" class="doc"><h1>{{ data.title }}</h1><div class="md" v-html="mdRender(data.md)" /></article>
  </div>
</template>
<style scoped>
.dn { min-height: 100vh; background: var(--c-paper-2); font-size: 15px; }
.top { display: flex; justify-content: space-between; align-items: center; padding: 14px 28px; background: #fff; border-bottom: 1px solid var(--c-rule); } .top b { color: var(--c-navy); font-size: 16px; }
.lk { color: var(--c-blue-deep); text-decoration: none; font-size: 13px; }
.pad { padding: 24px 28px; }
.doc { max-width: 760px; margin: 24px auto; background: #fff; border: 1px solid var(--c-rule); padding: 32px 40px; line-height: 1.6; color: var(--c-ink); }
.doc h1 { font-size: 24px; color: var(--c-navy); margin: 0 0 16px; font-weight: 600; }
.md :deep(h3) { font-size: 16px; color: var(--c-navy); margin: 24px 0 8px; font-weight: 600; }
.md :deep(p) { margin: 0 0 12px; } .md :deep(ul) { margin: 0 0 12px; padding-left: 20px; } .md :deep(li) { margin: 0 0 6px; }
@media (max-width: 640px) { .top { padding: 12px 16px; } .doc { margin: 0; border: 0; padding: 20px 16px; } }
</style>
