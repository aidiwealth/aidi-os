// Banking against Financials, month by month, for the company chosen at the top (or the group).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  if ((await currentOrg())?.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  return reconView(await forecastScope(event))
})
