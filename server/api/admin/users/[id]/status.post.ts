// Disable (signs them out everywhere) or re-enable a user: { status: 'active' | 'disabled' }
import { z } from 'zod'
const Body = z.object({ status: z.enum(['active', 'disabled']) })
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  if (b.data.status === 'disabled') {
    if (id.data === admin.userId) throw apiError('self', 'You cannot disable your own access.', 400)
    const isAdmin = await db().query("SELECT 1 FROM core.user_roles WHERE user_id = $1 AND role_code = 'admin' AND scope_entity_id IS NULL", [id.data])
    if (isAdmin.rowCount && await activeAdminCount() <= 1) throw apiError('last_admin', 'This workspace must keep at least one admin.', 400)
  }
  const u = await db().query('UPDATE core.memberships SET status = $2 WHERE user_id = $1', [id.data, b.data.status])
  if (u.rowCount !== 1) throw apiError('not_found', 'User not found', 404)
  if (b.data.status === 'disabled') await revokeSessions(id.data, 'access disabled', admin.orgId)
  await audit({ event, actorUserId: admin.userId, action: b.data.status === 'disabled' ? 'user.disable' : 'user.enable', objectType: 'user', objectId: id.data })
  return { ok: true }
})
