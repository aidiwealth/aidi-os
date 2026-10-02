<script setup lang="ts">
// App shell. The sidebar lists the modules this person can use, grouped Venture Capital / Family Office / Administration.
interface Mod { code: string; group: string; groupLabel: string; label: string; to: string; usable: boolean }
const { data: me } = await useFetch<{ email: string; roles: string[] }>('/api/auth/me')
const { data: mods } = await useFetch<Mod[]>('/api/modules', { key: 'modules' })
const groups = computed(() => {
  const out: { label: string; items: Mod[] }[] = []
  for (const m of (mods.value ?? []).filter((x) => x.usable)) {
    let g = out.find((x) => x.label === m.groupLabel)
    if (!g) { g = { label: m.groupLabel, items: [] }; out.push(g) }
    g.items.push(m)
  }
  return out
})
async function signOut() { await $fetch('/api/auth/logout', { method: 'POST' }); await navigateTo('/login') }
</script>

<template>
  <div class="shell">
    <aside class="side" aria-label="Aidi OS">
      <div class="brand"><span class="brand-mark" aria-label="Aidi"><AidiWordmark /></span><span class="brand-div" /><span class="brand-arm">OS</span></div>
      <nav class="side-nav">
        <NuxtLink to="/" exact-active-class="on">Overview</NuxtLink>
        <template v-for="g in groups" :key="g.label">
          <p class="grp">{{ g.label }}</p>
          <NuxtLink v-for="m in g.items" :key="m.code" :to="m.to" active-class="on">{{ m.label }}</NuxtLink>
        </template>
      </nav>
      <div v-if="me" class="who"><span>{{ me.email }}</span><button type="button" @click="signOut">Sign out</button></div>
    </aside>
    <main id="main" class="main"><slot /></main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 232px 1fr; min-height: 100vh; }
.side { background: var(--c-navy); color: #fff; padding: 24px 20px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
.brand-mark { display: flex; width: 58px; height: 23px; color: #fff; }
.brand-mark :deep(svg) { width: 100%; height: 100%; display: block; }
.brand-div { width: 1px; height: 18px; background: rgba(255,255,255,.3); }
.brand-arm { font-family: var(--font-heading); font-style: italic; font-size: 1.2rem; }
.side-nav { display: flex; flex-direction: column; gap: 2px; }
.side-nav a { color: rgba(255,255,255,.75); text-decoration: none; padding: 8px 10px; font-size: 13px; }
.side-nav a:hover, .side-nav a.on { color: #fff; background: rgba(255,255,255,.08); }
.grp { margin: 18px 0 4px; padding: 0 10px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.45); }
.main { padding: 40px 48px; min-width: 0; }
.who { margin-top: auto; padding-top: 24px; font-size: 12px; color: rgba(255,255,255,.6); display: flex; flex-direction: column; gap: 6px; overflow-wrap: anywhere; }
.who button { align-self: flex-start; background: none; border: 1px solid rgba(255,255,255,.3); color: #fff; font: inherit; padding: 4px 10px; cursor: pointer; }
@media (max-width: 880px) { .shell { grid-template-columns: 1fr; } .side { padding: 16px 20px; } .brand { margin-bottom: 12px; } .side-nav { flex-direction: row; flex-wrap: wrap; } .grp { display: none; } .main { padding: 24px 20px; } }
</style>
