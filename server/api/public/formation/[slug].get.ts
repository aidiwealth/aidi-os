// The formation sign-up page: packages, add-ons and states.
export default defineEventHandler(async (event) => {
  await orgBySlug(String(getRouterParam(event, 'slug') ?? ''))
  const c = await formationCatalog()
  const o = await currentOrg()
  return { ...c, states: FORMATION_STATES, online: csProviders('USD', o?.settings.brand).length > 0, workspace: await publicWorkspace() }
})
