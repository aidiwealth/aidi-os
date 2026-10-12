// The team's view of the client message centre. Opening it marks the client's messages as read.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const r = await db().query(
    `SELECT * FROM (SELECT m.id, m.from_team, m.category, m.body, m.created_at, m.read_by_client, coalesce(pp.full_name, sp.name) AS author, d.id AS doc_id, d.title AS doc_name, d.size_bytes::int AS doc_size FROM services.messages m LEFT JOIN core.documents d ON d.id = m.document_id
       LEFT JOIN core.users uu ON uu.id = m.author_user_id LEFT JOIN core.people pp ON pp.id = uu.person_id LEFT JOIN services.people sp ON sp.id = m.author_person_id
      WHERE m.client_id = $1 ORDER BY m.created_at DESC LIMIT 200) x ORDER BY created_at`, [id.data])
  await db().query('UPDATE services.messages SET read_by_team = now() WHERE client_id = $1 AND NOT from_team AND read_by_team IS NULL', [id.data])
  return r.rows
})
