// Finvry workspaces that have shared updates with us, to link to a portfolio company (search by name). GPs with access
// to the whole group only.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  if (String(event.context.entityScope ?? '')) throw apiError('forbidden', 'Linking Finvry workspaces needs access to the whole group.', 403)
  return finvryWorkspaces(String(getQuery(event).q ?? ''))
})
