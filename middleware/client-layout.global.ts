// /client pages: members of a Finvry company workspace see them inside the app frame instead of the portal frame.
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/client') || to.path.startsWith('/client/login') || to.path.startsWith('/client/welcome')) return
  try {
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
    const me = await $fetch<{ org: { kind: string } | null }>('/api/auth/me', { headers })
    if (me.org?.kind === 'company') setPageLayout('default')
  } catch { /* not signed in to Finvry: the portal frame handles it */ }
})
