// Shared rules for team management.
export const ROLES = ['admin', 'gp', 'team', 'family', 'adviser', 'founder', 'investor', 'client'] as const
export type Role = typeof ROLES[number]
const KIND: Record<Role, string> = { admin: 'team', gp: 'team', team: 'team', family: 'family', adviser: 'adviser', founder: 'founder', investor: 'investor', client: 'client' }
export const personKind = (role: Role): string => KIND[role]

export async function activeAdminCount(): Promise<number> {
  const r = await db().query<{ n: number }>(
    "SELECT count(DISTINCT u.id)::int AS n FROM core.users u JOIN core.user_roles r ON r.user_id = u.id WHERE r.role_code = 'admin' AND r.scope_entity_id IS NULL AND u.status = 'active'")
  return r.rows[0]?.n ?? 0
}
