export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const org = await currentOrg()
  return { ...(await csBilling()), slug: org?.slug ?? '', online: { usd: csProviders('USD', org?.settings.brand).length > 0, ngn: csProviders('NGN', org?.settings.brand).length > 0 } }
})
