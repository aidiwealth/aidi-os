// A client's recurring services (virtual office, registered agent) with their renewal dates.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Client not found', 404)
  return clientRenewals(id.data)
})
