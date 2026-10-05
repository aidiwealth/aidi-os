// The team attaches a file in a conversation (?client=).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp', 'services')
  const cid = String(getQuery(event).client ?? '')
  const c = /^[0-9a-f-]{36}$/.test(cid) ? (await db().query<{ name: string; organization_id: string }>('SELECT name, organization_id FROM services.clients WHERE id = $1', [cid])).rows[0] : undefined
  if (!c) throw apiError('not_found', 'Client not found', 404)
  return storeChatFile(event, c.organization_id, c.name, user.userId)
})
