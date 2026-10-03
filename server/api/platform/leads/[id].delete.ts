// Delete a Finvry lead (its activity goes with it). A converted customer's workspace is not affected.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Lead not found', 404)
  const name = await asPlatform(async () => {
    const r = await db().query<{ company: string }>('DELETE FROM platform.leads WHERE id = $1 RETURNING company', [id.data])
    if (!r.rows[0]) throw apiError('not_found', 'Lead not found', 404)
    return r.rows[0].company
  })
  await platformAudit(event, staff.userId, 'lead_delete', null, { company: name })
  return { ok: true }
})
