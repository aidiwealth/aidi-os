// Turn automatic renewal of a storage pack on or off.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? ''); const b = z.object({ auto_renew: z.boolean() }).safeParse(await readBody(event))
  if (!/^[0-9a-f-]{36}$/.test(id) || !b.success) throw apiError('invalid', 'Invalid request.')
  await db().query('UPDATE core.storage_addons SET auto_renew = $2 WHERE id = $1', [id, b.data.auto_renew])
  return { ok: true }
})
