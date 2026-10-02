// Grant or remove one role: { action: 'add' | 'remove', role, entity_id? }
import { z } from 'zod'
const Body = z.object({
  action: z.enum(['add', 'remove']),
  role: z.enum(ROLES),
  entity_id: z.string().uuid().nullable().optional()
})
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose a role.')
  const scope = b.data.entity_id ?? null
  const u = await db().query("SELECT status FROM core.users WHERE id = $1", [id.data])
  if (u.rowCount !== 1) throw apiError('not_found', 'User not found', 404)
  if (b.data.action === 'add') {
    await db().query('INSERT INTO core.user_roles (user_id, role_code, scope_entity_id, granted_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [id.data, b.data.role, scope, admin.userId])
  } else {
    if (b.data.role === 'admin' && scope === null) {
      if (id.data === admin.userId) throw apiError('self', 'You cannot remove your own admin role. Ask another admin.', 400)
      if (await activeAdminCount() <= 1) throw apiError('last_admin', 'Aidi OS must keep at least one admin.', 400)
    }
    await db().query('DELETE FROM core.user_roles WHERE user_id = $1 AND role_code = $2 AND scope_entity_id IS NOT DISTINCT FROM $3',
      [id.data, b.data.role, scope])
    await revokeSessions(id.data, 'role removed: ' + b.data.role)
  }
  await audit({ event, actorUserId: admin.userId, action: 'user.role_' + b.data.action, objectType: 'user', objectId: id.data, entityId: scope ?? undefined, detail: { role: b.data.role } })
  return { ok: true }
})
