// Support sign-in: a Finvry console user acts as a company workspace's owner (audited, 4 hours max). If the workspace
// has no owner yet but belongs to a services client, the client's main contact is added as owner quietly — no email
// is sent, so the client doesn't learn about the account until you invite them.
import type { H3Event } from 'h3'
import { AIDI_ORG_SQL } from '~/server/utils/session'
export async function ensureQuietOwner(orgId: string): Promise<boolean> {
  const has = (await asPlatform(() => db().query(`SELECT 1 FROM core.memberships m JOIN core.users u ON u.id = m.user_id AND u.status = 'active'
      JOIN core.user_roles r ON r.user_id = u.id AND r.organization_id = m.organization_id AND r.role_code = 'admin' WHERE m.organization_id = $1 AND m.status = 'active' LIMIT 1`, [orgId]))).rowCount
  if (has) return false
  const c = (await asPlatform(() => db().query<{ email: string | null; contact_name: string | null; name: string }>('SELECT email, contact_name, name FROM services.clients WHERE workspace_id = $1 ORDER BY created_at LIMIT 1', [orgId]))).rows[0]
  if (!c?.email) return false
  await addWorkspaceUser(orgId, c.email, c.contact_name || c.name, 'admin')
  return true
}
export interface SupportOpts { userId?: string | null; reason: string; canEdit: boolean; minutes: number }
// Support sign-in ("Log in as"): Aidi staff open a Finvry customer's account as one of its users to see exactly what
// they see. View only unless changes are allowed when it starts; ends on its own (30 minutes from the console) and
// cannot be extended. Each one is recorded in core.impersonations, which the customer sees in Settings → Support
// access, and in the customer's own audit trail. Never for Aidi OS workspaces.
export async function supportSignIn(event: H3Event, staffUserId: string, orgId: string, opts: SupportOpts): Promise<{ as: string; name: string; owner_created: boolean; redirect: string }> {
  const created = opts.userId ? false : await ensureQuietOwner(orgId)
  const t = (await asPlatform(() => db().query<{ user_id: string; email: string; kind: string; name: string; aidi: boolean }>(
    `SELECT u.id AS user_id, u.email, o.kind, o.name, ${AIDI_ORG_SQL} AS aidi FROM core.organizations o JOIN core.memberships m ON m.organization_id = o.id AND m.status = 'active' JOIN core.users u ON u.id = m.user_id AND u.status = 'active'
      WHERE o.id = $1 AND ($2::uuid IS NULL AND EXISTS (SELECT 1 FROM core.user_roles r WHERE r.user_id = u.id AND r.organization_id = o.id AND r.role_code = 'admin') OR u.id = $2::uuid) ORDER BY m.created_at LIMIT 1`, [orgId, opts.userId ?? null]))).rows[0]
  if (!t) throw apiError('no_owner', opts.userId ? 'That person is not an active member of this workspace.' : 'This workspace has no owner yet and no client email to set one up. Add the client\'s email first.', 409)
  if (t.kind !== 'company' || t.aidi) throw apiError('protected', 'Support sign-in is for Finvry customer workspaces only.', 400)
  const minutes = Math.min(240, Math.max(5, Math.round(opts.minutes)))
  const imp = (await asPlatform(() => one<{ id: string }>("INSERT INTO core.impersonations (organization_id, staff_user_id, target_user_id, reason, can_edit, expires_at, ip) VALUES ($1,$2,$3,$4,$5, now() + make_interval(mins => $6), $7) RETURNING id",
    [orgId, staffUserId, t.user_id, opts.reason.trim().slice(0, 500), opts.canEdit, minutes, ipOrNull(event) ?? null]))).id
  const mark = (sid: string) => asPlatform(() => db().query('UPDATE core.sessions SET impersonated_by = $2, impersonation_id = $3, expires_at = least(expires_at, now() + make_interval(mins => $4)) WHERE id = $1', [sid, staffUserId, imp, minutes]))
  // The customer's workspace opens on Finvry, so the team sees exactly what the customer sees. From the console's
  // address the session is handed over; the console session there is untouched.
  let redirect = '/'
  if (hostBrand(event) !== 'finvry') {
    const h = await sessionHandoff(event, t.user_id, t.email, orgId, 'finvry')
    await mark(h.sid)
    const back = brands()[hostBrand(event)].url
    redirect = brands().finvry.url + '/api/auth/handoff?t=' + encodeURIComponent(h.token) + '&back=' + encodeURIComponent(back)
  } else {
    const current = getCookie(event, 'aidi_os_session')
    if (current) setCookie(event, RETURN_COOKIE, current, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: minutes * 60 })
    await issueSession(event, t.user_id, t.email, orgId)
    await mark((await asPlatform(() => one<{ id: string }>('SELECT id FROM core.sessions WHERE user_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 1', [t.user_id, orgId]))).id)
  }
  const detail = { as: t.email, reason: opts.reason.trim().slice(0, 500), changes_allowed: opts.canEdit, minutes, owner_created_quietly: created }
  await audit({ event, actorUserId: staffUserId, action: 'platform.support_signin', objectType: 'organization', objectId: orgId, detail })
  await platformAudit(event, staffUserId, 'support_signin', orgId, detail)
  return { as: t.email, name: t.name, owner_created: created, redirect }
}
