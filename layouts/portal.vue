<script setup lang="ts">
// The client portal frame: the firm's name, the client, navigation and sign-out. Flat, Aidi type.
interface Me { name: string; client: string; workspace: { firm: string; brand: string } }
const { data, error } = await useFetch<Me>('/api/portal/me', { key: 'portal:me' })
if (error.value?.statusCode === 401) await navigateTo('/client/login')
const route = useRoute()
const nav = [{ to: '/client', label: 'Home' }, { to: '/client/documents', label: 'Documents' }, { to: '/client/invoices', label: 'Invoices & payments' }, { to: '/client/messages', label: 'Messages' }]
const on = (to: string) => (to === '/client' ? route.path === '/client' || route.path.startsWith('/client/jobs') : route.path.startsWith(to))
async function signOut() { await $fetch('/api/portal/auth/logout', { method: 'POST' }); await navigateTo('/client/login') }
useHead({ titleTemplate: (t?: string) => (t ? t + ' — ' : '') + (data.value?.workspace.firm ?? 'Client portal') })
</script>

<template>
  <div class="pt">
    <header class="top"><div class="in">
      <div class="brand"><span v-if="data?.workspace.brand === 'aidi'" class="mk"><AidiWordmark /></span><b v-else>{{ data?.workspace.firm }}</b><span class="sep" /><span class="arm">Client portal</span></div>
      <nav><NuxtLink v-for="n in nav" :key="n.to" :to="n.to" :class="{ on: on(n.to) }">{{ n.label }}</NuxtLink></nav>
      <div class="who"><span>{{ data?.name }}<em>{{ data?.client }}</em></span><button type="button" class="link" @click="signOut">Sign out</button></div>
    </div></header>
    <main class="in main"><slot /></main>
    <footer class="in foot">{{ data?.workspace.firm }} · Your documents and messages are private to you and our team.</footer>
  </div>
</template>

<style scoped>
.pt { min-height: 100vh; background: var(--c-paper-2); display: flex; flex-direction: column; }
.in { max-width: 1120px; margin: 0 auto; width: 100%; padding: 0 24px; box-sizing: border-box; }
.top { background: #fff; border-bottom: 1px solid var(--c-rule); } .top .in { display: flex; align-items: center; gap: 28px; height: 64px; }
.brand { display: flex; align-items: center; gap: 12px; } .mk { display: inline-flex; height: 22px; color: var(--c-navy); } .mk :deep(svg) { height: 22px; width: auto; } .brand b { font-family: var(--font-heading); font-weight: 500; font-size: 20px; color: var(--c-navy); }
.sep { width: 1px; height: 20px; background: var(--c-rule-strong); } .arm { font-family: var(--font-heading); font-style: italic; font-size: 18px; color: var(--c-navy); }
nav { display: flex; gap: 22px; flex: 1; } nav a { color: var(--c-muted); text-decoration: none; font-size: 14px; padding: 21px 0; border-bottom: 2px solid transparent; } nav a.on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.who { display: flex; align-items: center; gap: 14px; font-size: 13.5px; } .who span { display: flex; flex-direction: column; text-align: right; } .who em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.main { padding-top: 28px; padding-bottom: 40px; flex: 1; } .foot { padding-bottom: 24px; font-size: 12px; color: var(--c-muted); }
@media (max-width: 860px) { .top .in { flex-wrap: wrap; height: auto; padding-top: 12px; gap: 10px; } nav { order: 3; width: 100%; overflow-x: auto; } nav a { padding: 10px 0; white-space: nowrap; } }
</style>
