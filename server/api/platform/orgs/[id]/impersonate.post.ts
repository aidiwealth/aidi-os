// Support access: sign in to a customer workspace as its owner to fix something. The console session is kept in a
// separate cookie so "Return to console" restores it. Audited; Finvry customer workspaces only.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('invalid', 'Invalid request.')
  const t = (await asPlatform(() => db().query<{ user_id: string; email: string; kind: string; name: string }>(
    `SELECT u.id AS user_id, u.email, o.kind, o.name FROM core.organizations o JOIN core.memberships m ON m.organization_id = o.id AND m.status = 'active' JOIN core.users u ON u.id = m.user_id AND u.status = 'active'
      JOIN core.user_roles r ON r.user_id = u.id AND r.organization_id = o.id AND r.role_code = 'admin' WHERE o.id = $1 ORDER BY m.created_at LIMIT 1`, [id.data]))).rows[0]
  if (!t) throw apiError('no_owner', 'This workspace has no active owner yet. Invite the owner first.', 409)
  if (t.kind !== 'company') throw apiError('protected', 'Support sign-in is for Finvry customer workspaces only.', 400)
  const current = getCookie(event, 'aidi_os_session')
  if (current) setCookie(event, RETURN_COOKIE, current, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: 4 * 3600 })
  await issueSession(event, t.user_id, t.email, id.data)
  await asPlatform(() => db().query('UPDATE core.sessions SET impersonated_by = $2, expires_at = least(expires_at, now() + interval \'4 hours\') WHERE id = (SELECT id FROM core.sessions WHERE user_id = $1 AND organization_id = $3 ORDER BY created_at DESC LIMIT 1)', [t.user_id, staff.userId, id.data]))
  await audit({ event, actorUserId: staff.userId, action: 'platform.support_signin', objectType: 'organization', objectId: id.data, detail: { as: t.email } })
  return { ok: true, as: t.email, name: t.name }
})
