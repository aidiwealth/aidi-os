// Remove a person from this workspace (their roles and membership). If they belong to no other workspace, their
// sign-in is removed too.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('invalid', 'Invalid request.')
  if (id.data === admin.userId) throw apiError('self', 'You cannot remove yourself.', 400)
  const org = (await currentOrg())!
  const isAdmin = await db().query("SELECT 1 FROM core.user_roles WHERE user_id = $1 AND role_code = 'admin'", [id.data])
  if (isAdmin.rowCount && await activeAdminCount() <= 1) throw apiError('last_admin', 'This workspace must keep at least one admin.', 400)
  await asPlatform(() => db().query('SELECT core.remove_member($1, $2)', [id.data, org.id]))
  await audit({ event, actorUserId: admin.userId, action: 'admin.user_remove', objectType: 'user', objectId: id.data })
  return { ok: true }
})
