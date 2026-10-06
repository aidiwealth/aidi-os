// Console owners: members of this workspace and their Finvry console access.
export default defineEventHandler(async (event) => {
  const s = await requirePlatform(event)
  const org = (await currentOrg())!
  const rows = (await asPlatform(() => db().query("SELECT u.id, p.full_name AS name, u.email, ps.role AS console FROM core.memberships m JOIN core.users u ON u.id = m.user_id JOIN core.people p ON p.id = u.person_id LEFT JOIN core.platform_staff ps ON ps.user_id = u.id WHERE m.organization_id = $1 AND m.status = 'active' ORDER BY p.full_name", [org.id]))).rows
  return { rows, canEdit: s.staffRole === 'owner', me: s.userId }
})
