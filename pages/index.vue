<script setup lang="ts">
useHead({ title: 'Overview' })
const { data: me } = await useFetch<{ org: { name: string } | null }>('/api/auth/me', { key: 'me' })
</script>

<template>
  <section>
    <p class="label">{{ me?.org?.name ?? 'Workspace' }}</p>
    <h1>Overview</h1>
    <p class="lead">Your workspace at a glance. Use the menu to open each area.</p>
  </section>
</template>

<style scoped>
.lead { color: var(--c-muted); margin: 8px 0 0; }
</style>
