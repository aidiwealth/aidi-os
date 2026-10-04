// Open a tax information form from the portal (a fresh form link replaces the emailed one).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const r = await db().query("SELECT 1 FROM services.info_requests WHERE id = $1 AND client_id = $2 AND status IN ('sent','in_progress')", [id.data, u.clientId])
  if (!r.rowCount) throw apiError('not_found', 'This form is not open.', 404)
  return { url: await issueInfoLink(id.data) }
})
