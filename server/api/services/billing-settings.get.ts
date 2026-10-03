export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const org = await currentOrg()
  return { ...(await csBilling()), online: { usd: csProviders('USD', org?.settings.brand).length > 0, ngn: csProviders('NGN', org?.settings.brand).length > 0 } }
})
