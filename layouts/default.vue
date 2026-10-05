<script setup lang="ts">
// App shell (Telroi style): a light, collapsible sidebar on the soft shell background, and a white panel with a curved
// corner holding the topbar (breadcrumb, workspace switcher) and the page. Aidi staff on the Aidi OS address can switch
// between Aidi (their workspace) and Finvry (the platform console).
interface Mod { code: string; group: string; groupLabel: string; label: string; to: string; usable: boolean; locked?: boolean; pages?: string[] }
interface Org { id: string; name: string; plan_code: string; kind: string }
interface Me { email: string; roles: string[]; platform: boolean; org: Org | null; orgs: Org[] }
const brand = useBrand()
const route = useRoute()
const { data: me } = await useFetch<Me>('/api/auth/me', { key: 'me' })
const { data: mods } = await useFetch<Mod[]>('/api/modules', { key: 'modules' })
const canPlatform = computed(() => !!me.value?.platform && brand.key === 'aidi')
const deskPath = computed(() => route.path === '/services' || route.path.startsWith('/services/') || route.path.startsWith('/client-services'))
const platformMode = computed(() => route.path === '/platform' || route.path.startsWith('/platform/') || (canPlatform.value && deskPath.value))
const lockRouter = useRouter()
const nowPath = computed(() => lockRouter.currentRoute.value.path)
const lockedHere = computed(() => (mods.value ?? []).find((m) => m.locked && [m.to, ...(m.pages ?? [])].some((p) => nowPath.value === p || nowPath.value.startsWith(p + '/'))) ?? null)
const badges = ref<Record<string, number>>({})
async function loadBadges() { try { badges.value = await $fetch<Record<string, number>>('/api/notifications') } catch { /* signed out */ } }
const AREA: [string, string][] = [['/client', 'client'], ['/fundraising', 'fundraising']]
watch(nowPath, async (pth) => {
  const a = pth === '/services' ? 'jobs' : AREA.find(([pre]) => pth === pre || pth.startsWith(pre + '/'))?.[1]
  if (a) await $fetch('/api/notifications/seen', { method: 'POST', body: { area: a } }).catch(() => {})
  setTimeout(loadBadges, 600)
}, { immediate: false })
let badgeTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { loadBadges(); badgeTimer = setInterval(loadBadges, 60000) })
onBeforeUnmount(() => clearInterval(badgeTimer))
const badgeTotal = computed(() => Object.values(badges.value).reduce((a, b) => a + b, 0))
useHead({ titleTemplate: (t?: string) => (badgeTotal.value ? '(' + badgeTotal.value + ') ' : '') + (t ?? '') })
const desk = computed(() => (mods.value ?? []).filter((m) => m.usable && m.group === 'cs'))
const groups = computed(() => {
  const out: { label: string; items: Mod[] }[] = []
  for (const m of (mods.value ?? []).filter((x) => (x.usable || x.locked) && !(canPlatform.value && x.group === 'cs'))) {
    let g = out.find((x) => x.label === m.groupLabel)
    if (!g) { g = { label: m.groupLabel, items: [] }; out.push(g) }
    g.items.push(m)
  }
  return out
})
const PLATFORM_NAV = [{ to: '/platform', label: 'Overview', icon: 'gauge', exact: true }, { to: '/platform/pipeline', label: 'Pipeline', icon: 'funnel', exact: false }, { to: '/platform/customers', label: 'Customers', icon: 'customers', exact: false }, { to: '/platform/billing', label: 'Billing', icon: 'billing', exact: false }, { to: '/platform/finance', label: 'Finance', icon: 'banking', exact: false }, { to: '/platform/plans', label: 'Plans & pricing', icon: 'plans', exact: false }, { to: '/platform/settings', label: 'Settings', icon: 'settings', exact: false }]
const PLAN: Record<string, string> = { company_free: 'Free', company_startup: 'Startup', company_scale: 'Scale', internal: 'Internal' }
const collapsed = useState('sb-collapsed', () => false)
const mobileOpen = ref(false)
const wsOpen = ref(false)
const initials = (n: string) => { const w = n.split(/\s+/).filter((x) => x && !/^(the|of|and|&)$/i.test(x)); return (w.length ? w : n.split(/\s+/)).map((x) => x[0]).slice(0, 2).join('').toUpperCase() }
const isOn = (to: string, exact = false) => (exact ? nowPath.value === to : nowPath.value === to || nowPath.value.startsWith(to + '/'))
const crumbs = computed(() => {
  if (platformMode.value && deskPath.value) { const m = desk.value.find((x) => isOn(x.to)); return ['Services desk', m?.label ?? 'Clients'] }
  if (platformMode.value) { const n = [...PLATFORM_NAV].reverse().find((x) => isOn(x.to, x.exact)); return ['Finvry', n?.label ?? 'Overview'] }
  if (route.path === '/') return [me.value?.org?.name ?? 'Workspace', me.value?.org?.kind === 'company' ? 'Dashboard' : 'Overview']
  for (const g of groups.value) { const m = g.items.find((x) => isOn(x.to)); if (m) return [g.label, m.label] }
  return [me.value?.org?.name ?? 'Workspace']
})
async function switchOrg(id: string) {
  wsOpen.value = false
  if (id === me.value?.org?.id) return
  await $fetch('/api/auth/org', { method: 'POST', body: { organization_id: id } })
  window.location.href = '/'
}
const setMode = (m: 'workspace' | 'platform') => navigateTo(m === 'platform' ? '/platform' : '/')
async function signOut() { await $fetch('/api/auth/logout', { method: 'POST' }); await navigateTo('/login') }
function toggleSidebar() { if (import.meta.client && window.innerWidth <= 880) mobileOpen.value = !mobileOpen.value; else collapsed.value = !collapsed.value }
watch(() => route.fullPath, () => { mobileOpen.value = false; wsOpen.value = false })
</script>

<template>
  <div class="shell" :class="{ collapsed, 'mobile-open': mobileOpen }">
    <div class="overlay" @click="mobileOpen = false" />
    <aside class="sidebar" :aria-label="brand.name">
      <NuxtLink to="/" class="sb-brand"><BrandMark v-if="!collapsed" /><span v-else class="sb-mono">{{ brand.key === 'finvry' ? 'F' : 'A' }}</span></NuxtLink>

      <div v-if="canPlatform && !collapsed" class="mode" role="tablist" aria-label="Switch between Aidi and Finvry">
        <button type="button" role="tab" :aria-selected="!platformMode" :class="{ on: !platformMode }" @click="setMode('workspace')">Aidi</button>
        <button type="button" role="tab" :aria-selected="platformMode" :class="{ on: platformMode }" @click="setMode('platform')">Finvry</button>
        <span class="thumb" :class="{ right: platformMode }" />
      </div>

      <nav class="sb-nav">
        <template v-if="!platformMode">
          <NuxtLink to="/" class="sb-link" :class="{ on: isOn('/', true) }" :title="me?.org?.kind === 'company' ? 'Dashboard' : 'Overview'"><AppIcon name="home" class="sb-icon" /><span class="sb-label">{{ me?.org?.kind === 'company' ? 'Dashboard' : 'Overview' }}</span></NuxtLink>
          <template v-for="g in groups" :key="g.label">
            <p class="sb-group">{{ g.label }}</p>
            <NuxtLink v-for="m in g.items" :key="m.code" :to="m.to" class="sb-link" :class="{ on: isOn(m.to), lockd: m.locked }" :title="m.locked ? m.label + ' (upgrade to unlock)' : m.label"><AppIcon :name="m.code" class="sb-icon" /><span class="sb-label">{{ m.label }}</span><span v-if="badges[m.to]" class="sb-badge">{{ badges[m.to]! > 99 ? '99+' : badges[m.to] }}</span><svg v-if="m.locked" class="sb-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></NuxtLink>
          </template>
        </template>
        <template v-else>
          <p class="sb-group">Finvry platform</p>
          <NuxtLink v-for="n in PLATFORM_NAV" :key="n.to" :to="n.to" class="sb-link" :class="{ on: isOn(n.to, n.exact) }" :title="n.label"><AppIcon :name="n.icon" class="sb-icon" /><span class="sb-label">{{ n.label }}</span></NuxtLink>
          <template v-if="desk.length"><p class="sb-group">Services desk</p>
            <NuxtLink v-for="m in desk" :key="m.code" :to="m.to" class="sb-link" :class="{ on: isOn(m.to, m.to === '/services') }" :title="m.label"><AppIcon :name="m.code" class="sb-icon" /><span class="sb-label">{{ m.label }}</span><span v-if="badges[m.to]" class="sb-badge">{{ badges[m.to]! > 99 ? '99+' : badges[m.to] }}</span></NuxtLink></template>
          <p v-if="!collapsed && !deskPath" class="sb-note">Commercial data only. Customer data is never shown here.</p>
        </template>
      </nav>

      <div class="sb-foot">
        <div v-if="me" class="sb-user" :title="me.email"><span class="av me">{{ me.email.slice(0, 1).toUpperCase() }}</span><span class="sb-label em">{{ me.email }}</span></div>
        <button type="button" class="sb-link" title="Sign out" @click="signOut"><AppIcon name="logout" class="sb-icon" /><span class="sb-label">Sign out</span></button>
        <button type="button" class="sb-collapse" :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" @click="collapsed = !collapsed"><AppIcon :name="collapsed ? 'right' : 'left'" /></button>
      </div>
    </aside>

    <div class="panel">
      <header class="topbar">
        <button type="button" class="tb-menu" aria-label="Menu" @click="toggleSidebar"><AppIcon name="menu" /></button>
        <nav class="crumbs" aria-label="Breadcrumb"><template v-for="(c, i) in crumbs" :key="i"><span v-if="i" class="sep">/</span><span :class="{ cur: i === crumbs.length - 1 }">{{ c }}</span></template></nav>
        <span v-if="platformMode" class="env">Finvry console</span>
        <div v-if="me?.org && !platformMode" class="ws">
          <button type="button" class="ws-btn" :class="{ multi: me.orgs.length > 1 }" :aria-expanded="wsOpen" @click="me.orgs.length > 1 && (wsOpen = !wsOpen)">
            <span class="av">{{ initials(me.org.name) }}</span><span class="ws-t"><b>{{ me.org.name }}</b><em>{{ PLAN[me.org.plan_code] ?? me.org.plan_code }}</em></span>
            <AppIcon v-if="me.orgs.length > 1" name="chevron" class="chev" :class="{ up: wsOpen }" />
          </button>
          <ul v-if="wsOpen" class="ws-menu" role="menu">
            <li v-for="o in me.orgs" :key="o.id"><button type="button" role="menuitem" :class="{ cur: o.id === me.org.id }" @click="switchOrg(o.id)"><span class="av sm">{{ initials(o.name) }}</span><span>{{ o.name }}<em>{{ PLAN[o.plan_code] ?? o.plan_code }}</em></span></button></li>
          </ul>
        </div>
      </header>
      <main id="main" class="content"><div class="inner" :class="{ bleed: !lockedHere && route.meta.fullBleed }"><Paywall v-if="lockedHere" :key="lockedHere.code" :code="lockedHere.code" :label="lockedHere.label" /><slot v-else /></div></main>
    </div>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: var(--vh100); background: var(--c-paper-2); }
.sidebar { width: var(--sidebar-w); flex: none; display: flex; flex-direction: column; padding: 18px 12px 12px; position: sticky; top: 0; height: var(--vh100); overflow-y: auto; transition: width .18s ease; }
.collapsed .sidebar { width: 68px; }
.sb-brand { display: flex; align-items: center; height: 32px; padding: 0 10px; margin-bottom: 18px; text-decoration: none; color: var(--c-navy); }
.sb-mono { width: 32px; height: 32px; border-radius: 0; background: var(--c-navy); color: #fff; display: grid; place-items: center; font-weight: 600; font-size: 14px; margin-left: -4px; }
.mode { position: relative; display: grid; grid-template-columns: 1fr 1fr; background: rgba(15,17,21,.06); border-radius: 0; padding: 3px; margin: 0 4px 16px; }
.mode button { position: relative; z-index: 1; background: none; border: 0; font: inherit; font-size: 13px; font-weight: 500; color: var(--c-muted); padding: 6px 0; cursor: pointer; transition: color .15s; }
.mode button.on { color: var(--c-ink); }
.mode .thumb { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px); background: #fff; border-radius: 0; box-shadow: 0 1px 2px rgba(15,17,21,.08), 0 0 0 1px rgba(15,17,21,.04); transition: transform .2s ease; }
.mode .thumb.right { transform: translateX(100%); }
.sb-nav { display: flex; flex-direction: column; gap: 1px; flex: 1; }
.sb-group { margin: 16px 0 4px; padding: 0 12px; font-size: 11.5px; font-weight: 500; color: var(--c-muted); white-space: nowrap; overflow: hidden; }
.collapsed .sb-group { height: 1px; margin: 12px 10px; padding: 0; background: var(--c-rule); color: transparent; }
.sb-link { display: flex; align-items: center; gap: 11px; width: 100%; padding: 7px 12px; border-radius: var(--radius-sm); color: var(--c-ink-soft); font: inherit; font-size: 13.5px; font-weight: 500; text-decoration: none; background: none; border: 0; cursor: pointer; text-align: left; transition: background .12s, color .12s; }
.sb-link:hover { background: rgba(15,17,21,.05); color: var(--c-ink); }
.sb-link.on { background: var(--c-signal-soft); color: var(--c-signal); }
.sb-icon { width: 18px; height: 18px; flex: none; }
.sb-badge { margin-left: auto; min-width: 19px; height: 19px; padding: 0 6px; border-radius: 10px; background: #d93a3a; color: #fff; font-size: 11px; font-weight: 600; display: grid; place-items: center; line-height: 1; } .collapsed .sb-badge { position: absolute; margin: 0; transform: translate(14px, -10px); min-width: 16px; height: 16px; font-size: 10px; padding: 0 4px; }
.sb-lock { width: 13px; height: 13px; margin-left: auto; color: var(--c-muted); flex: none; } .sb-link.lockd .sb-label { opacity: .75; }
.sb-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.collapsed .sb-label, .collapsed .sb-note { display: none; } .collapsed .sb-link { justify-content: center; padding: 9px 0; }
.sb-note { margin: 12px; font-size: 11.5px; line-height: 1.45; color: var(--c-muted); }
.sb-foot { border-top: 1px solid var(--c-rule); padding-top: 10px; margin-top: 12px; display: flex; flex-direction: column; gap: 2px; }
.sb-user { display: flex; align-items: center; gap: 10px; padding: 6px 12px; font-size: 12.5px; color: var(--c-muted); min-width: 0; }
.collapsed .sb-user { justify-content: center; padding: 6px 0; }
.em { flex: 1; min-width: 0; }
.sb-collapse { align-self: flex-end; margin-top: 4px; width: 30px; height: 30px; border-radius: var(--radius-sm); border: 0; background: none; color: var(--c-muted); cursor: pointer; display: grid; place-items: center; }
.sb-collapse:hover { background: rgba(15,17,21,.05); color: var(--c-ink); } .sb-collapse svg { width: 16px; height: 16px; }
.collapsed .sb-collapse { align-self: center; }
.av { flex: none; width: 28px; height: 28px; border-radius: 0; display: grid; place-items: center; background: var(--c-blue-deep); color: #fff; font-size: 11px; font-weight: 600; letter-spacing: .02em; }
.av.sm { width: 24px; height: 24px; font-size: 10px; border-radius: 0; } .av.me { width: 24px; height: 24px; border-radius: 0; background: var(--c-navy); font-size: 11px; }
.panel { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--c-paper); border-left: 1px solid var(--c-rule); border-top: 1px solid var(--c-rule); border-top-left-radius: 0; margin-top: 10px; min-height: calc(var(--vh100) - 10px); }
.topbar { height: var(--topbar-h); flex: none; display: flex; align-items: center; gap: 14px; padding: 0 28px; border-bottom: 1px solid var(--c-rule); position: sticky; top: 0; background: rgba(255,255,255,.92); backdrop-filter: saturate(1.4) blur(8px); z-index: 10; border-top-left-radius: 0; }
.tb-menu { display: none; width: 34px; height: 34px; border-radius: var(--radius-sm); border: 1px solid var(--c-rule); background: #fff; color: var(--c-ink); cursor: pointer; place-items: center; } .tb-menu svg { width: 18px; height: 18px; }
.crumbs { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--c-muted); min-width: 0; flex: 1; white-space: nowrap; overflow: hidden; }
.crumbs .cur { color: var(--c-ink); font-weight: 500; } .sep { color: var(--c-rule-strong); }
.env { font-size: 11.5px; font-weight: 500; color: var(--c-signal); background: var(--c-signal-soft); padding: 3px 9px; border-radius: 0; }
.ws { position: relative; }
.ws-btn { display: flex; align-items: center; gap: 9px; height: 38px; padding: 0 10px 0 5px; border: 1px solid var(--c-rule); border-radius: 0; background: #fff; font: inherit; color: var(--c-ink); cursor: default; }
.ws-btn.multi { cursor: pointer; } .ws-btn.multi:hover { background: var(--c-paper-3); }
.ws-t { display: flex; flex-direction: column; line-height: 1.15; text-align: left; } .ws-t b { font-size: 13px; font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ws-t em { font-style: normal; font-size: 11px; color: var(--c-muted); }
.chev { width: 14px; height: 14px; color: var(--c-muted); transition: transform .15s; } .chev.up { transform: rotate(180deg); }
.ws-menu { position: absolute; right: 0; top: calc(100% + 6px); min-width: 260px; list-style: none; margin: 0; padding: 6px; background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); box-shadow: var(--shadow-pop); z-index: 30; }
.ws-menu button { width: 100%; display: flex; align-items: center; gap: 10px; background: none; border: 0; padding: 8px; border-radius: var(--radius-sm); font: inherit; font-size: 13px; color: var(--c-ink); cursor: pointer; text-align: left; }
.ws-menu button span:last-child { display: flex; flex-direction: column; } .ws-menu em { font-style: normal; font-size: 11px; color: var(--c-muted); }
.ws-menu button:hover { background: var(--c-paper-3); } .ws-menu button.cur { background: var(--c-signal-soft); }
.content { flex: 1; min-width: 0; }
.inner { max-width: 1200px; margin: 0 auto; padding: 28px 36px 72px; } .inner.bleed { max-width: none; padding: 0; }
.overlay { display: none; }
@media (max-width: 880px) {
  .sidebar { position: fixed; left: 0; top: 0; z-index: 60; background: var(--c-paper-2); width: var(--sidebar-w) !important; transform: translateX(-100%); transition: transform .2s ease; box-shadow: var(--shadow-pop); }
  .mobile-open .sidebar { transform: none; }
  .collapsed .sb-label, .collapsed .sb-note { display: inline; }
  .overlay { display: block; position: fixed; inset: 0; z-index: 55; background: rgba(15,17,21,.4); opacity: 0; pointer-events: none; transition: opacity .2s; }
  .mobile-open .overlay { opacity: 1; pointer-events: auto; }
  .panel { border-radius: 0; margin-top: 0; border-left: 0; } .topbar { border-radius: 0; padding: 0 16px; }
  .tb-menu { display: grid; } .ws-t { display: none; } .inner { padding: 20px 16px 56px; }
  .sb-collapse { display: none; }
}
</style>
