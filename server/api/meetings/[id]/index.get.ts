// One meeting's minutes.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family', 'admin')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const m = (await db().query("SELECT m.*, e.name AS entity, coalesce(p.full_name, u.email) AS by_name FROM core.meeting_minutes m LEFT JOIN core.entities e ON e.id = m.entity_id LEFT JOIN core.users u ON u.id = m.created_by LEFT JOIN core.people p ON p.id = u.person_id WHERE m.id = $1 AND " + meetingScope(event, user.userId, 2).sql, [id.data, ...meetingScope(event, user.userId, 2).params])).rows[0]
  if (!m) throw apiError('not_found', 'Not found', 404)
  return m
})
