// Finvry workspaces to link to a portfolio company (search by name).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  return finvryWorkspaces(String(getQuery(event).q ?? ''))
})
