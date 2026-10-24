<script setup lang="ts">
// The link in an "export ready" email: signed in (the app asks first if not), the file downloads.
useHead({ title: 'Your export' })
const route = useRoute(), href = computed(() => '/api/exports/' + String(route.params.id))
onMounted(() => { window.location.href = href.value })
</script>
<template>
  <section class="ex"><div class="card"><h1>Your export</h1><p>The download should start on its own.</p><a class="btn" :href="href">Download</a><NuxtLink to="/" class="lk">Back to the dashboard</NuxtLink></div></section>
</template>
<style scoped>
.ex { display: grid; place-items: center; min-height: 50vh; } .card { padding: 32px 36px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; max-width: 420px; }
h1 { margin: 0; font-size: 24px; } p { margin: 0; color: var(--c-muted); } .lk { font-size: 13px; color: var(--c-blue-deep); }
</style>
