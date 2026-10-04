// The message centre: conversation with the team. Opening it marks the team's messages as read.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const r = await db().query(
    `SELECT m.id, m.from_team, m.body, m.created_at, coalesce(pp.full_name, sp.name) AS author FROM services.messages m
       LEFT JOIN core.users uu ON uu.id = m.author_user_id LEFT JOIN core.people pp ON pp.id = uu.person_id LEFT JOIN services.people sp ON sp.id = m.author_person_id
      WHERE m.client_id = $1 ORDER BY m.created_at DESC LIMIT 200`, [u.clientId])
  await db().query('UPDATE services.messages SET read_by_client = now() WHERE client_id = $1 AND from_team AND read_by_client IS NULL', [u.clientId])
  return r.rows
})
