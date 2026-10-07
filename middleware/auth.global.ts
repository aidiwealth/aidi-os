// Pages: anyone not signed in goes to /login; a page in a module that is off (or not for this role) goes to Overview;
// the Finvry console is only for Aidi platform staff on the Aidi OS address.
export default defineNuxtRouteMiddleware(async (to) => {
  if (String(to.name ?? '').startsWith('handle')) return
  if (to.path === '/login' || to.path === '/start' || to.path.startsWith('/c/') || to.path.startsWith('/u/') || to.path.startsWith('/d/') || to.path.startsWith('/unsub/') || to.path.startsWith('/report/') || to.path.startsWith('/job/') || to.path.startsWith('/pay/') || to.path.startsWith('/lp/') || to.path === '/developers' || to.path.startsWith('/b/') || to.path.startsWith('/deck/') || to.path.startsWith('/wv/') || to.path.startsWith('/legal/') || to.path === '/integrations/quickbooks/disconnected' || to.path.startsWith('/wr/') || to.path.startsWith('/wpay/') || to.path === '/status' || to.path.startsWith('/bill/') || to.path.startsWith('/info/') || to.path.startsWith('/formation/') || to.path.startsWith('/share/')) return
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  let me: { platform: boolean; org: { id: string } | null }
  try {
    me = await $fetch('/api/auth/me', { headers })
  } catch {
    return navigateTo('/login')
  }
  if (to.path === '/platform' || to.path.startsWith('/platform/')) return me.platform && useBrand().key === 'aidi' ? undefined : navigateTo('/')
  if (!me.org) return me.platform && useBrand().key === 'aidi' ? navigateTo('/platform') : undefined
  if (to.path === '/') return
  try {
    const mods = await $fetch<{ pages: string[]; usable: boolean; locked?: boolean }[]>('/api/modules', { headers })
    const m = mods.find((x) => x.pages.some((p) => to.path === p || to.path.startsWith(p + '/')))
    if (m && !m.usable && !m.locked) return navigateTo('/')
  } catch { /* if the module list cannot load, the APIs still enforce access */ }
})
