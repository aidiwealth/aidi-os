// Who runs the Team page (people, contracts and pay; who can sign in). Admins everywhere. On Aidi OS, GPs too, with
// every feature, as long as their GP role covers the whole group (a GP limited to some companies cannot see the
// group's people and pay). On a Finvry company workspace it stays with admins.
import type { H3Event } from 'h3'
import type { SessionUser } from './session'
export async function requireTeamManager(event: H3Event): Promise<SessionUser> {
  const u = await requireRole(event, 'admin', 'gp')
  if (u.roles.includes('admin')) return u
  const org = await currentOrg()
  const scoped = String(event.context.entityScope ?? '').split(',').filter(Boolean).length > 0
  if (!org || org.kind === 'company' || scoped) throw apiError('forbidden', 'You do not have access to this.', 403)
  return u
}
// A GP can manage everyone except admins: only an admin gives, removes, disables or removes an admin.
export async function assertCanManage(actor: SessionUser, targetUserId: string | null, role?: string): Promise<void> {
  if (actor.roles.includes('admin')) return
  if (role === 'admin') throw apiError('forbidden', 'Only an admin can give or remove the Admin role.', 403)
  if (targetUserId) {
    const a = await db().query("SELECT 1 FROM core.user_roles WHERE user_id = $1 AND role_code = 'admin'", [targetUserId])
    if (a.rowCount) throw apiError('forbidden', 'Only an admin can change an admin.', 403)
  }
}
