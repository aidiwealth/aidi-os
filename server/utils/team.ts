// Shared rules for team management.
export const ROLES = ['admin', 'gp', 'team', 'family', 'adviser', 'founder', 'investor', 'client'] as const
export type Role = typeof ROLES[number]
const KIND: Record<Role, string> = { admin: 'team', gp: 'team', team: 'team', family: 'family', adviser: 'adviser', founder: 'founder', investor: 'investor', client: 'client' }
export const personKind = (role: Role): string => KIND[role]

export async function activeAdminCount(): Promise<number> {
  const r = await db().query<{ n: number }>(
    `SELECT count(DISTINCT m.user_id)::int AS n FROM core.memberships m JOIN core.users u ON u.id = m.user_id JOIN core.user_roles r ON r.user_id = m.user_id
      WHERE m.status = 'active' AND u.status = 'active' AND r.role_code = 'admin' AND r.scope_entity_id IS NULL`)
  return r.rows[0]?.n ?? 0
}
