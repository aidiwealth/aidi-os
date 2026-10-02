// Pages: anyone not signed in goes to /login.
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path.startsWith('/report/')) return
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  try {
    await $fetch('/api/auth/me', { headers })
  } catch {
    return navigateTo('/login')
  }
})
