<script setup lang="ts">
// App shell (Telroi style): a light, collapsible sidebar on the soft shell background, and a white panel with a curved
// corner holding the topbar (breadcrumb, workspace switcher) and the page. Aidi staff on the Aidi OS address can switch
// between Aidi (their workspace) and Finvry (the platform console).
interface Mod { code: string; group: string; groupLabel: string; label: string; to: string; usable: boolean; locked?: boolean; pages?: string[]; navHidden?: boolean }
interface Org { id: string; name: string; plan_code: string; kind: string }
interface Me { email: string; roles: string[]; platform: boolean; customers_view?: boolean; org: Org | null; orgs: Org[] }
const brand = useBrand()
const route = useRoute()
const { data: me } = await useFetch<Me>('/api/auth/me', { key: 'me' })
const { data: mods } = await useFetch<Mod[]>('/api/modules', { key: 'modules' })
const canPlatform = computed(() => !!me.value?.platform && brand.key === 'aidi')
const deskPath = computed(() => route.path === '/services' || route.path.startsWith('/services/') || route.path.startsWith('/client-services'))
const platformMode = computed(() => (canPlatform.value && (route.path === '/platform' || route.path.startsWith('/platform/'))) || (canPlatform.value && deskPath.value))
// Team roles that are not console staff can still view Finvry customer accounts (read-only).
const customersLink = computed(() => !canPlatform.value && !!me.value?.customers_view && brand.key === 'aidi')
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
const desk = computed(() => (mods.value ?? []).filter((m) => !m.navHidden && m.usable && m.group === 'cs'))
const support = computed(() => (me.value as { support?: { by: string; by_name: string; can_edit: boolean; until: string } | null } | null)?.support ?? null)
const supNow = ref(Date.now()); let supTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { supTimer = setInterval(() => { supNow.value = Date.now(); if (support.value && Date.parse(support.value.until) <= supNow.value) endSupport() }, 15000) })
onBeforeUnmount(() => clearInterval(supTimer))
const supLeft = computed(() => (support.value ? Math.max(0, Math.ceil((Date.parse(support.value.until) - supNow.value) / 60000)) : 0))
async function endSupport() { clearInterval(supTimer); const r = await $fetch<{ to: string }>('/api/auth/return', { method: 'POST' }).catch(() => ({ to: '/login' })); window.location.href = r.to }
// The workspace menu: a short list of items, each opening its first page; the item's other pages are the sub-menu
// across the top of the page. Items list the modules they hold; a module the person cannot use is left out, one only a
// higher plan unlocks shows a lock. A module no item lists gets its own item, so nothing is ever lost from the menu.
interface WsDef { label: string; codes: string[]; extra?: WsTab[] }
interface WsTab { to: string; label: string; code: string; locked?: boolean; pages?: string[]; match?: (p: string) => boolean }
interface WsItem { label: string; icon: string; to: string; tabs: WsTab[] }
const COMPANY_MENU: { label: string | null; items: WsDef[] }[] = [
  { label: 'Investors', items: [{ label: 'Financials', codes: ['financials'] }, { label: 'Investors', codes: ['fundraising', 'contacts', 'updates', 'investor_page'] }, { label: 'Cap table', codes: ['equity', 'forecast'] }, { label: 'Boards', codes: ['boards'] }] },
  { label: 'Company', items: [{ label: 'Documents', codes: ['documents', 'decks'] }, { label: 'Compliance', codes: ['compliance', 'entities', 'meetings', 'governance'] },
    { label: 'Services', codes: ['company_services', 'client_inbox', 'wallet', 'client_raise'], extra: [{ to: '/perks', label: 'Perks', code: 'perks' }] }] },
  { label: 'Administration', items: [{ label: 'Settings', codes: ['settings', 'team'] }] }]
// Aidi OS: grouped like Finvry, but the pages the team opens every day keep their own place in the side menu
// (Pitches, Payments, Tax documents, Meeting minutes, Team, Blog).
const AIDI_MENU: { label: string | null; items: WsDef[] }[] = [
  { label: 'Venture capital', items: [{ label: 'Pitches', codes: ['pitches'] }, { label: 'Investments', codes: ['pipeline', 'portfolio', 'credit'] }, { label: 'Funds & LPs', codes: ['funds', 'contacts', 'updates', 'decks', 'investor_page', 'directory'] }] },
  { label: 'Money', items: [{ label: 'Financials', codes: ['financials', 'boards', 'equity', 'forecast'] }, { label: 'Payments', codes: ['expenses'] }, { label: 'Accounting', codes: ['banking', 'books', 'deployments'] },
    { label: 'Wealth', codes: ['wealth_mgmt', 'wealth', 'secondaries', 'rentals'] }, { label: 'Tax documents', codes: ['tax_docs'] }] },
  { label: 'Company', items: [{ label: 'Governance', codes: ['entities', 'governance', 'compliance'] }, { label: 'Meeting minutes', codes: ['meetings'] }, { label: 'Documents', codes: ['documents'] }, { label: 'Notices', codes: ['notices'] }] },
  { label: 'Administration', items: [{ label: 'Team', codes: ['team'] }, { label: 'Blog', codes: ['blog'] }, { label: 'Settings', codes: ['settings', 'modules'] }] }]
const isCompany = computed(() => me.value?.org?.kind === 'company')
// Services for a company is one sub-menu in the order work happens: see your jobs, order, talk to us, files, then
// paying (invoices, the wallet you can pay from). Job pages sit under Overview; the job list sits with Invoices.
const SVC_ORDER = ['/client', '/client/order', '/client/messages', '/client/documents', '/client/invoices', '/wallet', '/client/raise', '/perks']
const svcTabs = (m: Mod): WsTab[] => [
  { to: '/client', label: 'Overview', code: m.code, match: (p: string) => p === '/client' || p.startsWith('/client/jobs/') },
  { to: '/client/order', label: 'Order a service', code: m.code },
  { to: '/client/documents', label: 'Documents', code: m.code },
  { to: '/client/invoices', label: 'Invoices', code: m.code, match: (p: string) => p === '/client/invoices' || p === '/client/jobs' }].filter((t) => t.to === '/client' || canPath(t.to))
const wsMenu = computed(() => {
  const all = (mods.value ?? []).filter((x) => (x.usable || x.locked) && !x.navHidden && !(canPlatform.value && x.group === 'cs'))
  const by = new Map(all.map((m) => [m.code, m])); const used = new Set<string>()
  const tabOf = (m: Mod): WsTab => { used.add(m.code); return { to: m.to, label: isCompany.value && m.code === 'updates' ? 'Updates' : m.label, code: m.code, locked: !!m.locked && !m.usable, pages: m.pages } }
  const item = (label: string, tabs: WsTab[]): WsItem | null => { const first = tabs.find((t) => !t.locked) ?? tabs[0]; return first ? { label: tabs.length === 1 ? tabs[0]!.label : label, icon: first.code, to: first.to, tabs } : null }
  const out = (isCompany.value ? COMPANY_MENU : AIDI_MENU).map((s) => ({ label: s.label, items: s.items.map((d) => {
    const tabs = d.codes.map((c) => by.get(c)).filter((m): m is Mod => !!m).flatMap((m) => (isCompany.value && m.code === 'company_services' ? (used.add(m.code), svcTabs(m)) : [tabOf(m)]))
    if (d.extra && tabs.length && isCompany.value) tabs.push(...d.extra)
    if (tabs.some((t) => t.code === 'company_services')) { tabs.sort((a, b) => (SVC_ORDER.indexOf(a.to) + 99) % 99 - (SVC_ORDER.indexOf(b.to) + 99) % 99); for (const t of tabs) if (t.code === 'client_inbox') t.label = 'Messages' }
    return item(d.label, tabs) }).filter((x): x is WsItem => !!x) }))
  for (const m of all.filter((x) => !used.has(x.code))) {
    let s = out.find((x) => x.label === m.groupLabel); if (!s) { s = { label: m.groupLabel, items: [] }; out.push(s) }
    const it = item(m.label, [tabOf(m)]); if (it) s.items.push(it)
  }
  return out.filter((s) => s.items.length)
})
const tabOn = (t: WsTab) => (t.match ? t.match(nowPath.value) : isOn(t.to) || (t.pages ?? []).some((p) => p !== t.to && isOn(p)))
const wsItemOn = (it: WsItem) => it.tabs.some(tabOn)
const wsCurrent = computed(() => { for (const s of wsMenu.value) for (const it of s.items) if (wsItemOn(it)) return { s, it }; return null })
const wsTabs = computed(() => (platformMode.value ? null : (wsCurrent.value && wsCurrent.value.it.tabs.length > 1 ? wsCurrent.value.it.tabs : null)))
provide('wsTabs', wsTabs)
const wsBadge = (it: WsItem) => it.tabs.reduce((t, x) => t + (badges.value[x.to] ?? 0), 0)
// The Finvry console in two parts that never mix: Finvry Platform (the subscription business: customers, plans,
// subscriptions and renewals, plan invoices, payments, wallets) and Finvry Services (the services desk: jobs, clients,
// service renewals, service invoices and payments, prices).
interface NavI { to: string; label: string; icon: string; exact?: boolean; tab?: string }
// Each sidebar item opens its first page; the related pages are tabs across the top of the page (the sub-menu).
interface NavG { label: string; icon: string; items: NavI[] }
const PLATFORM_GROUPS: NavG[] = [
  { label: 'Overview', icon: 'gauge', items: [{ to: '/platform', label: 'Overview', icon: 'gauge', exact: true }] },
  { label: 'Customers', icon: 'customers', items: [{ to: '/platform/customers', label: 'Customers', icon: 'customers' }, { to: '/platform/pipeline', label: 'Pipeline', icon: 'funnel' }] },
  { label: 'Billing', icon: 'billing', items: [{ to: '/platform/billing', label: 'Subscriptions & renewals', icon: 'billing', tab: 'subs' }, { to: '/platform/billing', label: 'Invoices', icon: 'documents', tab: 'inv' }, { to: '/platform/payments', label: 'Payments', icon: 'banking' }, { to: '/platform/finance', label: 'Wallets', icon: 'wallet' }] },
  { label: 'Plans & pricing', icon: 'plans', items: [{ to: '/platform/plans', label: 'Plans & pricing', icon: 'plans' }, { to: '/platform/partners', label: 'Partners & discounts', icon: 'customers' }, { to: '/platform/perks', label: 'Perks', icon: 'perks' }] },
  { label: 'Investors & grants', icon: 'fundraising', items: [{ to: '/platform/prospects', label: 'Investors & grants', icon: 'fundraising' }] },
  { label: 'Settings', icon: 'settings', items: [{ to: '/platform/settings', label: 'Platform settings', icon: 'settings' }] }]
const SERVICES_GROUPS: NavG[] = [
  { label: 'Jobs', icon: 'services', items: [{ to: '/services', label: 'Jobs', icon: 'services' }, { to: '/services/tracker', label: 'Renewals & requests', icon: 'pipeline' }] },
  { label: 'Clients', icon: 'customers', items: [{ to: '/services/clients', label: 'Clients', icon: 'customers' }, { to: '/services/raise', label: 'Fundraising clients', icon: 'fundraising' }, { to: '/services/agreements', label: 'Agreements', icon: 'sign' }] },
  { label: 'Billing', icon: 'billing', items: [{ to: '/services/invoices', label: 'Invoices', icon: 'documents' }, { to: '/services/invoices/jobs', label: 'By job', icon: 'documents' }, { to: '/services/invoices/payments', label: 'Payments', icon: 'banking' }] },
  { label: 'Inbox', icon: 'cs_inbox', items: [{ to: '/services/inbox', label: 'Inbox', icon: 'cs_inbox' }] },
  { label: 'Prices & settings', icon: 'settings', items: [{ to: '/services/settings', label: 'Prices & settings', icon: 'settings' }] },
  { label: 'Analytics', icon: 'cs_analytics', items: [{ to: '/client-services/analytics', label: 'Analytics', icon: 'cs_analytics' }] }]
const PLATFORM_NAV: NavI[] = PLATFORM_GROUPS.flatMap((g) => g.items)
const SERVICES_NAV: NavI[] = SERVICES_GROUPS.flatMap((g) => g.items)
const { canPath } = useModuleAccess()
// Services pages follow the desk modules (and the person's access); the jobs module carries clients, billing and prices.
const svcOk = (n: NavI) => desk.value.some((m) => m.to === n.to) || (['/services/clients', '/services/invoices', '/services/invoices/jobs', '/services/invoices/payments', '/services/agreements', '/services/settings'].includes(n.to) && desk.value.some((m) => m.to === '/services') && canPath(n.to))
const servicesGroups = computed(() => SERVICES_GROUPS.map((g) => ({ ...g, items: g.items.filter(svcOk) })).filter((g) => g.items.length))
const servicesNav = computed(() => servicesGroups.value.flatMap((g) => g.items))
const navOn = (n: NavI): boolean => {
  if (n.tab) return route.path === n.to && (n.tab === 'inv' ? route.query.tab === 'inv' : route.query.tab !== 'inv')
  if (n.to === '/services/invoices') return route.path === '/services/invoices' || route.path === '/services/invoices/new' || /^\/services\/invoices\/[0-9a-f-]{36}$/.test(route.path)
  if (n.to === '/services/invoices/jobs' || n.to === '/services/invoices/payments') return route.path === n.to
  if (n.to === '/services') return route.path === '/services' || /^\/services\/[0-9a-f-]{36}$/.test(route.path) || route.path === '/services/order' || route.path.startsWith('/services/requests')
  return isOn(n.to, n.exact)
}
const groupOn = (g: NavG) => g.items.some(navOn)
const linkOf = (n: NavI) => (n.tab === 'inv' ? { path: n.to, query: { tab: 'inv' } } : n.to)
// The sub-menu for the page you are on (Finvry console only): the other pages of its sidebar item.
const consoleTabs = computed(() => { if (!platformMode.value) return null; const g = [...PLATFORM_GROUPS, ...servicesGroups.value].find(groupOn); return g && g.items.length > 1 ? g.items : null })
provide('consoleTabs', consoleTabs)
provide('inConsole', platformMode)
// Financials sub-menu (company workspaces): the figures, revenue retention and churn, and customer analysis.
const FIN_SUBS: [string, string][] = [['/financials', 'Statements & overview'], ['/financials/retention', 'Revenue retention'], ['/financials/customers', 'Customers']]
const custLocked = computed(() => !!(mods.value ?? []).find((x) => x.code === 'fin_customers' && x.locked))
const PLAN: Record<string, string> = { company_free: 'Free', company_startup: 'Startup', company_scale: 'Scale', internal: 'Internal' }
const collapsed = useState('sb-collapsed', () => false)
const sbScrolled = ref(false)
const mobileOpen = ref(false)
const wsOpen = ref(false)
const initials = (n: string) => { const w = n.split(/\s+/).filter((x) => x && !/^(the|of|and|&)$/i.test(x)); return (w.length ? w : n.split(/\s+/)).map((x) => x[0]).slice(0, 2).join('').toUpperCase() }
const isOn = (to: string, exact = false) => (exact ? nowPath.value === to : nowPath.value === to || (nowPath.value.startsWith(to + '/') && !(to === '/client' && nowPath.value.startsWith('/client/messages')) && !(to === '/financials' && nowPath.value.startsWith('/financials/boards'))))
const crumbs = computed(() => {
  if (platformMode.value && deskPath.value) { const n = SERVICES_NAV.find((x) => navOn(x)); return ['Finvry Services', n?.label ?? 'Jobs'] }
  if (platformMode.value) { const n = PLATFORM_NAV.find((x) => navOn(x)); return ['Finvry Platform', n?.label ?? 'Overview'] }
  if (route.path === '/') return [me.value?.org?.name ?? 'Workspace', me.value?.org?.kind === 'company' ? 'Dashboard' : 'Overview']
  const sub = FIN_SUBS.slice(1).find(([to]) => isOn(to)); if (sub) return ['Financials', sub[1]]
  const c = wsCurrent.value; if (c) { const t = c.it.tabs.find(tabOn); return c.it.tabs.length > 1 && t && t.label !== c.it.label ? [c.it.label, t.label] : [c.s.label ?? me.value?.org?.name ?? 'Workspace', c.it.label] }
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
    <aside class="sidebar" :class="{ sbs: sbScrolled }" :aria-label="brand.name" @scroll.passive="sbScrolled = ($event.target as HTMLElement).scrollTop > 4">
      <div class="sb-top">
      <NuxtLink to="/" class="sb-brand"><BrandMark v-if="!collapsed" /><img v-else :src="brand.key === 'finvry' ? '/brand/finvry-mark.svg' : '/brand/aidi-mark-navy.svg'" :alt="brand.name" class="sb-logo"></NuxtLink>

      <div v-if="canPlatform && !collapsed" class="mode" role="tablist" aria-label="Switch between Aidi and Finvry">
        <button type="button" role="tab" :aria-selected="!platformMode" :class="{ on: !platformMode }" @click="setMode('workspace')">Aidi</button>
        <button type="button" role="tab" :aria-selected="platformMode" :class="{ on: platformMode }" @click="setMode('platform')">Finvry</button>
        <span class="thumb" :class="{ right: platformMode }" />
      </div>
      </div>

      <nav class="sb-nav">
        <template v-if="!platformMode">
          <NuxtLink v-if="!(me?.roles ?? []).every((r: string) => r === 'wealth_client') || !(me?.roles ?? []).length" to="/" class="sb-link" :class="{ on: isOn('/', true) }" :title="me?.org?.kind === 'company' ? 'Dashboard' : 'Overview'"><AppIcon name="home" class="sb-icon" /><span class="sb-label">{{ me?.org?.kind === 'company' ? 'Dashboard' : 'Overview' }}</span></NuxtLink>
          <template v-for="g in wsMenu" :key="g.label ?? ''">
            <p v-if="g.label" class="sb-group">{{ g.label }}</p>
            <NuxtLink v-for="it in g.items" :key="it.label" :to="it.to" class="sb-link" :class="{ on: wsItemOn(it), lockd: it.tabs.every((t) => t.locked) }" :title="it.tabs.every((t) => t.locked) ? it.label + ' (upgrade to unlock)' : it.label"><AppIcon :name="it.icon" class="sb-icon" /><span class="sb-label">{{ it.label }}</span><span v-if="wsBadge(it)" class="sb-badge">{{ wsBadge(it) > 99 ? '99+' : wsBadge(it) }}</span><svg v-if="it.tabs.every((t) => t.locked)" class="sb-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></NuxtLink>
          </template>
          <template v-if="customersLink"><p class="sb-group">Finvry</p><NuxtLink to="/platform/customers" class="sb-link" :class="{ on: isOn('/platform/customers') }" title="Finvry customers"><AppIcon name="customers" class="sb-icon" /><span class="sb-label">Finvry customers</span></NuxtLink></template>
          <a class="sb-link sb-help" :href="'mailto:' + (brand.key === 'finvry' ? 'support@finvry.com' : 'team@aidiventures.com') + '?subject=' + encodeURIComponent(brand.name + ' support')" title="Help & support"><AppIcon name="help" class="sb-icon" /><span class="sb-label">Help &amp; support</span></a>
        </template>
        <template v-else>
          <p class="sb-group">Finvry Platform</p>
          <NuxtLink v-for="g in PLATFORM_GROUPS" :key="g.label" :to="linkOf(g.items[0]!)" class="sb-link" :class="{ on: groupOn(g) }" :title="g.label"><AppIcon :name="g.icon" class="sb-icon" /><span class="sb-label">{{ g.label }}</span></NuxtLink>
          <template v-if="servicesGroups.length"><p class="sb-group">Finvry Services</p>
            <NuxtLink v-for="g in servicesGroups" :key="g.label" :to="linkOf(g.items[0]!)" class="sb-link" :class="{ on: groupOn(g) }" :title="g.label"><AppIcon :name="g.icon" class="sb-icon" /><span class="sb-label">{{ g.label }}</span><span v-if="g.items.reduce((t, n) => t + (badges[n.to] ?? 0), 0)" class="sb-badge">{{ g.items.reduce((t, n) => t + (badges[n.to] ?? 0), 0) }}</span></NuxtLink></template>
          <p v-if="!collapsed && !deskPath" class="sb-note">Commercial data only. Customer data is never shown here.</p>
        </template>
      </nav>

      <div class="sb-foot">
        <NuxtLink v-if="me" to="/account" class="sb-user" :title="me.email + ' · Account security'"><span class="av me">{{ me.email.slice(0, 1).toUpperCase() }}</span><span class="sb-label em">{{ me.email }}</span></NuxtLink>
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
      <div v-if="support" class="supbar" role="status"><span>Support access: you are seeing this account as <b>{{ me?.email }}</b></span><span class="sm">{{ support.can_edit ? 'Changes allowed, recorded as ' + support.by_name : 'View only' }} · ends in {{ supLeft }} min · the customer can see this visit</span><button type="button" @click="endSupport">End session</button></div>
      <main id="main" class="content"><div class="inner" :class="{ bleed: !lockedHere && route.meta.fullBleed }"><nav v-if="consoleTabs" class="ctabs"><NuxtLink v-for="n in consoleTabs" :key="n.label" :to="linkOf(n)" :class="{ on: navOn(n) }">{{ n.label }}</NuxtLink></nav><nav v-else-if="wsTabs" class="ctabs" :aria-label="wsCurrent?.it.label"><NuxtLink v-for="t in wsTabs" :key="t.to" :to="t.to" :class="{ on: tabOn(t), off: t.locked }">{{ t.label }}<svg v-if="t.locked" class="tl" viewBox="0 0 24 24" aria-label="Upgrade to unlock"><rect x="5" y="11" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8" /></svg></NuxtLink></nav><Paywall v-if="lockedHere" :key="lockedHere.code" :code="lockedHere.code" :label="lockedHere.label" /><slot v-else /></div></main>
      <AnalystPanel v-if="me && !(me.roles.length && me.roles.every((r: string) => r === 'wealth_client'))" />
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
.sb-subs { display: flex; flex-direction: column; margin: 1px 0 4px 23px; border-left: 1px solid var(--c-rule); } .sb-sub { padding: 5px 12px; font-size: 12.5px; color: var(--c-muted); text-decoration: none; } .sb-sub:hover { color: var(--c-ink); } .sb-sub.on { color: var(--c-signal); font-weight: 500; } .sb-sub { display: flex; align-items: center; }
.sb-icon { width: 18px; height: 18px; flex: none; }
.sb-badge { margin-left: auto; min-width: 19px; height: 19px; padding: 0 6px; border-radius: 0; background: #d93a3a; color: #fff; font-size: 11px; font-weight: 600; display: grid; place-items: center; line-height: 1; } .collapsed .sb-badge { position: absolute; margin: 0; transform: translate(14px, -10px); min-width: 16px; height: 16px; font-size: 10px; padding: 0 4px; }
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
.supbar .sm { opacity: .85; } .supbar b { font-weight: 600; }
.supbar { background: #b5470b; color: #fff; font-size: 13px; padding: 8px 16px; display: flex; gap: 6px 14px; align-items: center; justify-content: center; flex-wrap: wrap; } .supbar button { background: #fff; color: #b5470b; border: 0; padding: 4px 10px; font: inherit; font-weight: 600; cursor: pointer; }
.sidebar { background: var(--c-paper-2); }
.sb-top { position: sticky; top: -18px; z-index: 3; margin: -18px -12px 0; padding: 18px 12px 2px; background: var(--c-paper-2); }
.sb-top::after { content: ''; position: absolute; left: 0; right: 0; bottom: -26px; height: 26px; background: linear-gradient(var(--c-paper-2), rgba(0,0,0,0)); pointer-events: none; opacity: 0; transition: opacity .2s; } .sidebar.sbs .sb-top::after { opacity: 1; }
.sb-logo { width: 32px; height: 32px; display: block; margin-left: -4px; }
a.sb-user { text-decoration: none; } a.sb-user:hover { color: var(--c-ink); }
.ctabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 0 0 20px; overflow-x: auto; } .ctabs a { padding: 9px 0; font-size: 14px; color: var(--c-muted); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; } .ctabs a.on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .ctabs a:hover { color: var(--c-ink); } .ctabs a { display: inline-flex; align-items: center; gap: 6px; } .ctabs a.off { opacity: .7; } .ctabs .tl { width: 13px; height: 13px; }
</style>
