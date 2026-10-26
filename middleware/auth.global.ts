// Pages: anyone not signed in goes to /login; a page in a module that is off (or not for this role) goes to Overview;
// the Finvry console is only for Aidi platform staff on the Aidi OS address.
// Who is signed in and the module list are asked for once and kept for half a minute while moving between pages,
// instead of two round trips to the server before every page (the server checks access on every request anyway).
// Signing in or out, or switching workspace, starts afresh.
const TTL = 30_000
type Me = { platform: boolean; customers_view?: boolean; mfa_required?: boolean; org: { id: string } | null }
type Mods = { pages: string[]; usable: boolean; locked?: boolean }[]
export default defineNuxtRouteMiddleware(async (to) => {
  if (String(to.name ?? '').startsWith('handle')) return
  const cache = useState<{ me: Me | null; mods: Mods | null; at: number }>('mw-cache', () => ({ me: null, mods: null, at: 0 }))
  if (to.path === '/login' || to.path === '/start') cache.value = { me: null, mods: null, at: 0 }
  const fresh = import.meta.client && cache.value.me && Date.now() - cache.value.at < TTL
  if (to.path === '/login' || to.path === '/start' || to.path === '/partners' || to.path === '/rewards' || to.path.startsWith('/c/') || to.path.startsWith('/u/') || to.path.startsWith('/d/') || to.path.startsWith('/unsub/') || to.path.startsWith('/report/') || to.path.startsWith('/job/') || to.path.startsWith('/pay/') || to.path.startsWith('/lp/') || to.path === '/developers' || to.path.startsWith('/b/') || to.path.startsWith('/deck/') || to.path.startsWith('/wv/') || to.path.startsWith('/legal/') || to.path === '/integrations/quickbooks/disconnected' || to.path.startsWith('/wr/') || to.path.startsWith('/wpay/') || to.path === '/status' || to.path.startsWith('/bill/') || to.path.startsWith('/info/') || to.path.startsWith('/formation/') || to.path.startsWith('/share/') || to.path.startsWith('/v/') || to.path.startsWith('/sign/')) return
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  let me: Me
  if (fresh) me = cache.value.me!
  else {
    try { me = await $fetch<Me>('/api/auth/me', { headers }) } catch { cache.value = { me: null, mods: null, at: 0 }; return navigateTo('/login') }
    cache.value = { me, mods: null, at: import.meta.client ? Date.now() : 0 }
  }
  // Finvry: two-step verification first, and again whenever it is off.
  if (me.mfa_required && to.path !== '/security-setup') return navigateTo('/security-setup')
  if (!me.mfa_required && to.path === '/security-setup') return navigateTo('/')
  // Team roles in the Aidi workspace may view Finvry customer accounts (read-only); the rest of the console is for staff.
  if (to.path === '/platform/customers' || to.path.startsWith('/platform/customers/')) return (me.platform || me.customers_view) && useBrand().key === 'aidi' ? undefined : navigateTo('/')
  if (to.path === '/platform' || to.path.startsWith('/platform/')) return me.platform && useBrand().key === 'aidi' ? undefined : navigateTo('/')
  if (!me.org) return me.platform && useBrand().key === 'aidi' ? navigateTo('/platform') : undefined
  if (to.path === '/') return
  try {
    const mods = fresh && cache.value.mods ? cache.value.mods : await $fetch<Mods>('/api/modules', { headers })
    cache.value.mods = mods
    // The module with the longest matching page prefix (/financials/boards is Boards, not Financials).
    let m: typeof mods[number] | undefined, len = -1
    for (const x of mods) for (const p of x.pages) if ((to.path === p || to.path.startsWith(p + '/')) && p.length > len) { m = x; len = p.length }
    if (m && !m.usable && !m.locked) return navigateTo('/')
  } catch { /* if the module list cannot load, the APIs still enforce access */ }
})
