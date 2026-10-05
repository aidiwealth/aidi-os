// The services desk inbox: conversations with clients, open or closed, newest first, with unread counts.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp', 'services')
  const st = getQuery(event).status === 'closed' ? 'closed' : 'open'
  return (await db().query(`SELECT t.id, t.subject, t.status, t.opened_at, t.closed_at, t.closed_by, t.last_message_at, c.id AS client_id, c.name AS client,
      (SELECT coalesce(m.body, 'Shared a document') FROM services.messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last,
      (SELECT count(*)::int FROM services.messages m WHERE m.thread_id = t.id AND NOT m.from_team AND m.read_by_team IS NULL) AS unread
    FROM services.threads t JOIN services.clients c ON c.id = t.client_id WHERE t.status = $1 ORDER BY t.last_message_at DESC LIMIT 300`, [st])).rows
})
