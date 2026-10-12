<script setup lang="ts">
// Services desk inbox: conversations with clients as threads, each with a subject and a type. Start a new one with any
// client, reply, attach files, close or reopen. Support email has its own tab.
useHead({ title: 'Inbox' })
const route = useRoute()
const box = computed(() => (route.query.box === 'support' ? 'support' : 'clients'))
</script>
<template>
  <section>
    <p class="label">Services desk</p><h1>Inbox</h1>
    <nav class="bx" aria-label="Inbox"><NuxtLink :to="{ query: {} }" :class="{ on: box === 'clients' }">Client messages</NuxtLink><NuxtLink :to="{ query: { box: 'support' } }" :class="{ on: box === 'support' }">Support email <span class="mut">support@finvry.com</span></NuxtLink></nav>
    <SupportInbox v-if="box === 'support'" />
    <DeskThreads v-else :initial="String(route.query.t ?? '')" />
  </section>
</template>
<style scoped>
h1 { margin: 0 0 14px; }
.bx { display: flex; gap: 2px; border-bottom: 1px solid var(--c-rule); margin: 8px 0 14px; } .bx a { padding: 10px 14px; text-decoration: none; color: var(--c-muted); font-size: 14px; font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -1px; } .bx a.on { color: var(--c-ink); border-bottom-color: var(--c-navy); } .bx .mut { font-size: 12px; font-weight: 400; margin-left: 4px; color: var(--c-muted); }
</style>
