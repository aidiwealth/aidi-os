// Banking against Financials, month by month, for the company chosen at the top (or the group).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'family')
  return reconView(await forecastScope(event))
})
