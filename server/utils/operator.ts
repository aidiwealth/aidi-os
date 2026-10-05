// The services desk is only for the services team's workspace (The Aidi Group), never other internal workspaces.
export async function requireOperator(event: Parameters<typeof requireRole>[0]): Promise<Awaited<ReturnType<typeof requireRole>>> {
  const user = await requireRole(event, 'team', 'gp', 'services')
  const org = await currentOrg()
  if (!org || !(org.settings.services_operator === true || org.settings.services_operator === 'true')) throw apiError('not_found', 'Not found', 404)
  return user
}
