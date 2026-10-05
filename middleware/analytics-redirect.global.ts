// The Analytics pages now live as tabs on Overview.
export default defineNuxtRouteMiddleware((to) => {
  const map: Record<string, string> = { '/analytics': 'vc', '/family-office/analytics': 'fo', '/client-services/analytics': 'cs' }
  if (map[to.path]) return navigateTo({ path: '/', query: { tab: map[to.path] } })
})
