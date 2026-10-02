<script setup lang="ts">
// App shell. Sections appear as each milestone lands; nothing here links to unbuilt pages.
// Sections, each shown only to the roles that can use it (admins see everything).
const ALL: { to: string; label: string; roles: string[] }[] = [
  { to: '/', label: 'Overview', roles: [] },
  { to: '/deals', label: 'Pitches', roles: ['gp', 'team'] },
  { to: '/pipeline', label: 'Pipeline', roles: ['gp', 'team'] },
  { to: '/documents', label: 'Documents', roles: ['gp', 'team', 'family'] },
  { to: '/team', label: 'Team', roles: ['admin'] }
]
const { data: me } = await useFetch<{ email: string; roles: string[] }>('/api/auth/me')
const sections = computed(() => ALL.filter((s) => !s.roles.length || me.value?.roles.includes('admin') || s.roles.some((r) => me.value?.roles.includes(r))))
async function signOut() { await $fetch('/api/auth/logout', { method: 'POST' }); await navigateTo('/login') }
</script>

<template>
  <div class="shell">
    <aside class="side" aria-label="Aidi OS">
      <div class="brand"><span class="brand-mark" aria-label="Aidi"><AidiWordmark /></span><span class="brand-div" /><span class="brand-arm">OS</span></div>
      <nav class="side-nav">
        <NuxtLink v-for="s in sections" :key="s.to" :to="s.to" exact-active-class="on">{{ s.label }}</NuxtLink>
      </nav>
      <div v-if="me" class="who"><span>{{ me.email }}</span><button type="button" @click="signOut">Sign out</button></div>
    </aside>
    <main id="main" class="main"><slot /></main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 232px 1fr; min-height: 100vh; }
.side { background: var(--c-navy); color: #fff; padding: 24px 20px; }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 36px; }
.brand-mark { display: flex; width: 58px; height: 23px; color: #fff; }
.brand-mark :deep(svg) { width: 100%; height: 100%; display: block; }
.brand-div { width: 1px; height: 18px; background: rgba(255,255,255,.3); }
.brand-arm { font-family: var(--font-heading); font-style: italic; font-size: 1.2rem; }
.side-nav { display: flex; flex-direction: column; gap: 2px; }
.side-nav a { color: rgba(255,255,255,.75); text-decoration: none; padding: 8px 10px; font-size: 13px; }
.side-nav a:hover, .side-nav a.on { color: #fff; background: rgba(255,255,255,.08); }
.main { padding: 40px 48px; min-width: 0; }
.side { display: flex; flex-direction: column; }
.who { margin-top: auto; padding-top: 24px; font-size: 12px; color: rgba(255,255,255,.6); display: flex; flex-direction: column; gap: 6px; overflow-wrap: anywhere; }
.who button { align-self: flex-start; background: none; border: 1px solid rgba(255,255,255,.3); color: #fff; font: inherit; padding: 4px 10px; cursor: pointer; }
@media (max-width: 880px) { .shell { grid-template-columns: 1fr; } .side { padding: 16px 20px; } .brand { margin-bottom: 12px; } .side-nav { flex-direction: row; flex-wrap: wrap; } .main { padding: 24px 20px; } }
</style>
