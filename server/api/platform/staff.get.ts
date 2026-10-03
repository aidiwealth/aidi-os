// Aidi platform staff, to own leads.
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  return (await asPlatform(() => db().query(
    'SELECT u.id, p.full_name AS name, s.role FROM core.platform_staff s JOIN core.users u ON u.id = s.user_id JOIN core.people p ON p.id = u.person_id ORDER BY p.full_name'))).rows
})
