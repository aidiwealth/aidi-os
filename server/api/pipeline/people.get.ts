// People who can own a deal: active GPs, team members and admins.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const r = await db().query<{ id: string; name: string }>(
    `SELECT DISTINCT u.id, p.full_name AS name FROM core.users u JOIN core.people p ON p.id = u.person_id
       JOIN core.user_roles r ON r.user_id = u.id WHERE u.status = 'active' AND r.role_code IN ('gp','team','admin') ORDER BY name`)
  return r.rows
})
