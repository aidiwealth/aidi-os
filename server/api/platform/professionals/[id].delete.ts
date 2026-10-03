import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const name = await asPlatform(async () => {
    const r = await db().query<{ name: string }>('DELETE FROM platform.professionals WHERE id = $1 RETURNING name', [id.data])
    if (!r.rows[0]) throw apiError('not_found', 'Not found', 404)
    return r.rows[0].name
  })
  await platformAudit(event, staff.userId, 'professional_delete', null, { name })
  return { ok: true }
})
