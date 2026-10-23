// Everything feeding a company's Finvry in one place: bank connections and accounts, linked sheets (Financials,
// forecasts, Sales, Marketing, Banking), CRMs, accounting software, and updates waiting to be accepted, each with where
// it is managed. Only what this person's role can open is listed.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  if ((await currentOrg())?.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  return dataSources(await usableModules(user.roles, event))
})
