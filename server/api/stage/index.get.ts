// The Stage Monitor page: stage, health, runway, default-alive projection, readiness (Medium and Scale) and matched
// capital providers (Scale). Indicative only.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const org = await currentOrg()
  if (org?.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const s = await stageMonitor(event)
  const ent = await companyEntityId()
  const providers = s.tier >= 3 ? await matchProviders(s.country, s.funding.key, ent ? await businessModelOf('entity:' + ent).catch(() => null) : null) : null
  const pipelines = (await usableModules((event.context.user as SessionUser).roles, event)).has('fundraising')
  return { ...s, providers, can_pipeline: pipelines }
})
