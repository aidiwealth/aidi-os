<script setup lang="ts">
// App shell. Workspace mode: the modules this person can use in the current workspace, with a workspace switcher.
// Aidi staff on the Aidi OS address also get Finvry mode: the platform console for Finvry customers.
interface Mod { code: string; group: string; groupLabel: string; label: string; to: string; usable: boolean }
interface Org { id: string; name: string; plan_code: string; kind: string }
interface Me { email: string; roles: string[]; platform: boolean; org: Org | null; orgs: Org[] }
const brand = useBrand()
const route = useRoute()
const { data: me } = await useFetch<Me>('/api/auth/me', { key: 'me' })
const { data: mods } = await useFetch<Mod[]>('/api/modules', { key: 'modules' })
const platformMode = computed(() => route.path === '/platform' || route.path.startsWith('/platform/'))
const canPlatform = computed(() => !!me.value?.platform && brand.key === 'aidi')
const groups = computed(() => {
  const out: { label: string; items: Mod[] }[] = []
  for (const m of (mods.value ?? []).filter((x) => x.usable)) {
    let g = out.find((x) => x.label === m.groupLabel)
    if (!g) { g = { label: m.groupLabel, items: [] }; out.push(g) }
    g.items.push(m)
  }
  return out
})
const PLATFORM_NAV = [{ to: '/platform', label: 'Overview', exact: true }, { to: '/platform/pipeline', label: 'Pipeline', exact: false }, { to: '/platform/customers', label: 'Customers', exact: false }, { to: '/platform/billing', label: 'Billing', exact: false }, { to: '/platform/plans', label: 'Plans & pricing', exact: false }, { to: '/platform/settings', label: 'Settings', exact: false }]
const PLAN: Record<string, string> = { starter: 'Starter', growth: 'Growth', family_office: 'Family Office', enterprise: 'Enterprise', internal: 'Internal' }
const open = ref(false)
const initials = (n: string) => { const w = n.split(/\s+/).filter((x) => x && !/^(the|of|and|&)$/i.test(x)); return (w.length ? w : n.split(/\s+/)).map((x) => x[0]).slice(0, 2).join('').toUpperCase() }
const isOn = (to: string, exact = false) => (exact ? route.path === to : route.path === to || route.path.startsWith(to + '/'))
async function switchOrg(id: string) {
  open.value = false
  if (id === me.value?.org?.id) return
  await $fetch('/api/auth/org', { method: 'POST', body: { organization_id: id } })
  window.location.href = '/'
}
const setMode = (m: 'workspace' | 'platform') => navigateTo(m === 'platform' ? '/platform' : '/')
async function signOut() { await $fetch('/api/auth/logout', { method: 'POST' }); await navigateTo('/login') }
watch(() => route.path, () => { open.value = false })
</script>

<template>
  <div class="shell" :class="{ pf: platformMode }">
    <aside class="side" :aria-label="brand.name">
      <NuxtLink to="/" class="brand"><BrandMark light /></NuxtLink>

      <div v-if="canPlatform" class="mode" role="tablist" aria-label="Switch between Aidi and Finvry">
        <button type="button" role="tab" :aria-selected="!platformMode" :class="{ on: !platformMode }" @click="setMode('workspace')"><span class="dot a" />Aidi</button>
        <button type="button" role="tab" :aria-selected="platformMode" :class="{ on: platformMode }" @click="setMode('platform')"><span class="dot f" />Finvry</button>
        <span class="thumb" :class="{ right: platformMode }" />
      </div>

      <template v-if="!platformMode">
        <div v-if="me?.org" class="ws">
          <button type="button" class="ws-btn" :class="{ multi: me.orgs.length > 1 }" :aria-expanded="open" @click="me.orgs.length > 1 && (open = !open)">
            <span class="av">{{ initials(me.org.name) }}</span>
            <span class="ws-t"><b>{{ me.org.name }}</b><em>{{ PLAN[me.org.plan_code] ?? me.org.plan_code }}</em></span>
            <svg v-if="me.orgs.length > 1" class="chev" :class="{ up: open }" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
          </button>
          <ul v-if="open" class="ws-menu" role="menu">
            <li v-for="o in me.orgs" :key="o.id"><button type="button" role="menuitem" :class="{ cur: o.id === me.org.id }" @click="switchOrg(o.id)"><span class="av sm">{{ initials(o.name) }}</span>{{ o.name }}</button></li>
          </ul>
        </div>
        <nav class="side-nav">
          <NuxtLink to="/" :class="{ on: isOn('/', true) }">Overview</NuxtLink>
          <template v-for="g in groups" :key="g.label">
            <p class="grp">{{ g.label }}</p>
            <NuxtLink v-for="m in g.items" :key="m.code" :to="m.to" :class="{ on: isOn(m.to) }">{{ m.label }}</NuxtLink>
          </template>
        </nav>
      </template>

      <template v-else>
        <div class="pf-head"><b>Finvry platform</b><span>Customers, plans and subscriptions. Customer data is never shown here.</span></div>
        <nav class="side-nav">
          <NuxtLink v-for="n in PLATFORM_NAV" :key="n.to" :to="n.to" :class="{ on: isOn(n.to, n.exact) }">{{ n.label }}</NuxtLink>
        </nav>
      </template>

      <div v-if="me" class="who">
        <span class="av sm me">{{ me.email.slice(0, 1).toUpperCase() }}</span>
        <span class="em">{{ me.email }}</span>
        <button type="button" title="Sign out" aria-label="Sign out" @click="signOut"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v10h3M10 5l3 3-3 3M13 8H6" fill="none" stroke="currentColor" stroke-width="1.4" /></svg></button>
      </div>
    </aside>
    <main id="main" class="main"><slot /></main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 248px 1fr; min-height: 100vh; }
.side { background: var(--c-navy); color: #fff; padding: 22px 16px 16px; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
.pf .side { background: #0a1424; }
.brand { padding: 2px 8px 0; margin-bottom: 22px; text-decoration: none; display: block; }
.mode { position: relative; display: grid; grid-template-columns: 1fr 1fr; background: rgba(255,255,255,.07); padding: 3px; margin: 0 4px 18px; border: 1px solid rgba(255,255,255,.08); }
.mode button { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 7px; background: none; border: 0; color: rgba(255,255,255,.6); font: inherit; font-size: 12.5px; font-weight: 500; padding: 7px 0; cursor: pointer; transition: color .15s; }
.mode button.on { color: var(--c-navy); }
.mode .thumb { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px); background: #fff; transition: transform .2s ease; }
.mode .thumb.right { transform: translateX(100%); }
.dot { width: 6px; height: 6px; border-radius: 50%; } .dot.a { background: #8fb8d8; } .dot.f { background: #5fa8d3; }
.mode button:focus-visible { outline: 2px solid #5fa8d3; outline-offset: -2px; }
.ws { position: relative; margin: 0 4px 14px; }
.ws-btn { width: 100%; display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: #fff; padding: 9px 10px; font: inherit; text-align: left; cursor: default; }
.ws-btn.multi { cursor: pointer; } .ws-btn.multi:hover { background: rgba(255,255,255,.09); }
.av { flex: none; width: 28px; height: 28px; display: grid; place-items: center; background: #1c547d; color: #fff; font-size: 11px; font-weight: 600; letter-spacing: .04em; }
.av.sm { width: 22px; height: 22px; font-size: 10px; }
.ws-t { display: flex; flex-direction: column; min-width: 0; flex: 1; } .ws-t b { font-weight: 500; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ws-t em { font-style: normal; font-size: 11px; color: rgba(255,255,255,.5); }
.chev { width: 12px; height: 12px; color: rgba(255,255,255,.6); transition: transform .15s; } .chev.up { transform: rotate(180deg); }
.ws-menu { position: absolute; left: 0; right: 0; top: calc(100% + 4px); list-style: none; margin: 0; padding: 4px; background: #fff; border: 1px solid var(--c-rule); box-shadow: 0 8px 24px rgba(12,26,46,.18); z-index: 20; }
.ws-menu button { width: 100%; display: flex; align-items: center; gap: 8px; background: none; border: 0; padding: 8px; font: inherit; font-size: 13px; color: var(--c-ink); cursor: pointer; text-align: left; }
.ws-menu button:hover { background: var(--c-paper); } .ws-menu button.cur { font-weight: 600; color: var(--c-navy); }
.pf-head { margin: 0 8px 16px; padding: 12px; border-left: 2px solid #5fa8d3; background: rgba(95,168,211,.08); }
.pf-head b { display: block; font-weight: 500; font-size: 13px; } .pf-head span { display: block; font-size: 11.5px; line-height: 1.45; color: rgba(255,255,255,.55); margin-top: 3px; }
.side-nav { display: flex; flex-direction: column; gap: 1px; }
.side-nav a { color: rgba(255,255,255,.72); text-decoration: none; padding: 8px 12px; font-size: 13px; border-left: 2px solid transparent; transition: background .12s, color .12s; }
.side-nav a:hover { color: #fff; background: rgba(255,255,255,.05); }
.side-nav a.on { color: #fff; background: rgba(255,255,255,.08); border-left-color: #5fa8d3; }
.grp { margin: 18px 0 4px; padding: 0 12px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.4); }
.who { margin-top: auto; padding: 14px 8px 0; border-top: 1px solid rgba(255,255,255,.08); display: flex; align-items: center; gap: 8px; font-size: 12px; color: rgba(255,255,255,.65); }
.who .me { background: rgba(255,255,255,.12); }
.em { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who button { background: none; border: 1px solid rgba(255,255,255,.18); color: #fff; width: 28px; height: 28px; display: grid; place-items: center; cursor: pointer; padding: 0; }
.who button svg { width: 15px; height: 15px; } .who button:hover { background: rgba(255,255,255,.08); }
.main { padding: 40px 48px; min-width: 0; }
@media (max-width: 880px) { .shell { grid-template-columns: 1fr; } .side { position: static; height: auto; } .side-nav { flex-direction: row; flex-wrap: wrap; } .grp { display: none; } .main { padding: 24px 20px; } }
</style>
