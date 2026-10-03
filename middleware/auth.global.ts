// Pages: anyone not signed in goes to /login; a page in a module that is off (or not for this role) goes to Overview.
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path.startsWith('/report/') || to.path.startsWith('/job/')) return
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  try {
    await $fetch('/api/auth/me', { headers })
  } catch {
    return navigateTo('/login')
  }
  if (to.path === '/') return
  try {
    const mods = await $fetch<{ pages: string[]; usable: boolean }[]>('/api/modules', { headers })
    const m = mods.find((x) => x.pages.some((p) => to.path === p || to.path.startsWith(p + '/')))
    if (m && !m.usable) return navigateTo('/')
  } catch { /* if the module list cannot load, the APIs still enforce access */ }
})
