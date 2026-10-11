// Support sign-in: a Finvry console user acts as a company workspace's owner (audited, 4 hours max). If the workspace
// has no owner yet but belongs to a services client, the client's main contact is added as owner quietly — no email
// is sent, so the client doesn't learn about the account until you invite them.
import type { H3Event } from 'h3'
export async function ensureQuietOwner(orgId: string): Promise<boolean> {
  const has = (await asPlatform(() => db().query(`SELECT 1 FROM core.memberships m JOIN core.users u ON u.id = m.user_id AND u.status = 'active'
      JOIN core.user_roles r ON r.user_id = u.id AND r.organization_id = m.organization_id AND r.role_code = 'admin' WHERE m.organization_id = $1 AND m.status = 'active' LIMIT 1`, [orgId]))).rowCount
  if (has) return false
  const c = (await asPlatform(() => db().query<{ email: string | null; contact_name: string | null; name: string }>('SELECT email, contact_name, name FROM services.clients WHERE workspace_id = $1 ORDER BY created_at LIMIT 1', [orgId]))).rows[0]
  if (!c?.email) return false
  await addWorkspaceUser(orgId, c.email, c.contact_name || c.name, 'admin')
  return true
}
export async function supportSignIn(event: H3Event, staffUserId: string, orgId: string): Promise<{ as: string; name: string; owner_created: boolean }> {
  const created = await ensureQuietOwner(orgId)
  const t = (await asPlatform(() => db().query<{ user_id: string; email: string; kind: string; name: string }>(
    `SELECT u.id AS user_id, u.email, o.kind, o.name FROM core.organizations o JOIN core.memberships m ON m.organization_id = o.id AND m.status = 'active' JOIN core.users u ON u.id = m.user_id AND u.status = 'active'
      JOIN core.user_roles r ON r.user_id = u.id AND r.organization_id = o.id AND r.role_code = 'admin' WHERE o.id = $1 ORDER BY m.created_at LIMIT 1`, [orgId]))).rows[0]
  if (!t) throw apiError('no_owner', 'This workspace has no owner yet and no client email to set one up. Add the client\'s email first.', 409)
  if (t.kind !== 'company') throw apiError('protected', 'Support sign-in is for Finvry customer workspaces only.', 400)
  const current = getCookie(event, 'aidi_os_session')
  if (current) setCookie(event, RETURN_COOKIE, current, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: 4 * 3600 })
  await issueSession(event, t.user_id, t.email, orgId)
  await asPlatform(() => db().query('UPDATE core.sessions SET impersonated_by = $2, expires_at = least(expires_at, now() + interval \'4 hours\') WHERE id = (SELECT id FROM core.sessions WHERE user_id = $1 AND organization_id = $3 ORDER BY created_at DESC LIMIT 1)', [t.user_id, staffUserId, orgId]))
  await audit({ event, actorUserId: staffUserId, action: 'platform.support_signin', objectType: 'organization', objectId: orgId, detail: { as: t.email, owner_created_quietly: created } })
  return { as: t.email, name: t.name, owner_created: created }
}
