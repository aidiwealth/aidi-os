// One conversation with its messages and attachments; the client's earlier conversations. Marks client messages read.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const t = (await db().query<{ client_id: string }>('SELECT t.id, t.subject, t.status, t.opened_at, t.closed_at, t.closed_by, t.client_id, c.name AS client, c.email AS client_email FROM services.threads t JOIN services.clients c ON c.id = t.client_id WHERE t.id = $1', [id.data])).rows[0]
  if (!t) throw apiError('not_found', 'Not found', 404)
  const msgs = await db().query(`SELECT m.id, m.from_team, m.body, m.created_at, coalesce(pp.full_name, sp.name) AS author, d.id AS doc_id, split_part(d.title, ' — ', 2) AS doc_name, d.size_bytes AS doc_size FROM services.messages m
      LEFT JOIN core.users uu ON uu.id = m.author_user_id LEFT JOIN core.people pp ON pp.id = uu.person_id LEFT JOIN services.people sp ON sp.id = m.author_person_id LEFT JOIN core.documents d ON d.id = m.document_id
      WHERE m.thread_id = $1 ORDER BY m.created_at`, [id.data])
  await db().query('UPDATE services.messages SET read_by_team = now() WHERE thread_id = $1 AND NOT from_team AND read_by_team IS NULL', [id.data])
  const others = await db().query('SELECT id, subject, status, last_message_at FROM services.threads WHERE client_id = $1 AND id <> $2 ORDER BY last_message_at DESC LIMIT 20', [t.client_id, id.data])
  return { thread: t, messages: msgs.rows, others: others.rows }
})
