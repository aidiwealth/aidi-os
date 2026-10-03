export interface TeamUser {
  id: string; email: string; full_name: string; status: string; last_login_at: string | null; created_at: string
  roles: { role: string; entity_id: string | null; entity_name: string | null }[]
}
// Members of the current workspace (row-level security limits memberships and roles to it).
export default defineEventHandler(async (event): Promise<TeamUser[]> => {
  await requireRole(event, 'admin')
  const r = await db().query<TeamUser>(
    `SELECT u.id, u.email, p.full_name, m.status, u.last_login_at, m.created_at,
            coalesce(json_agg(json_build_object('role', ur.role_code, 'entity_id', ur.scope_entity_id, 'entity_name', e.name)
                     ORDER BY ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), '[]') AS roles
       FROM core.memberships m JOIN core.users u ON u.id = m.user_id JOIN core.people p ON p.id = u.person_id
       LEFT JOIN core.user_roles ur ON ur.user_id = u.id LEFT JOIN core.entities e ON e.id = ur.scope_entity_id
      GROUP BY u.id, p.full_name, m.status, m.created_at ORDER BY m.status, p.full_name`)
  return r.rows
})
