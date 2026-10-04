export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  return { entity_type: (org.settings.entity_type as string) ?? '', state: (org.settings.state as string) ?? '', types: ENTITY_TYPES, states: US_STATES }
})
