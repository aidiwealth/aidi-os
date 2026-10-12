// The services desk inbox: conversations with clients, newest first, with unread counts. ?status=open|closed|all,
// ?client= (one client's conversations), ?category= (one type).
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const q = getQuery(event)
  const st = q.status === 'closed' ? 'closed' : q.status === 'all' ? null : 'open'
  const client = /^[0-9a-f-]{36}$/.test(String(q.client ?? '')) ? String(q.client) : null
  const cat = /^[a-z_]{2,20}$/.test(String(q.category ?? '')) ? String(q.category) : null
  return (await db().query(`SELECT t.id, t.subject, t.status, t.category, t.started_by, t.opened_at, t.closed_at, t.closed_by, t.last_message_at, c.id AS client_id, c.name AS client,
      (SELECT coalesce(m.body, 'Shared a document') FROM services.messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last,
      (SELECT count(*)::int FROM services.messages m WHERE m.thread_id = t.id) AS n,
      (SELECT count(*)::int FROM services.messages m WHERE m.thread_id = t.id AND NOT m.from_team AND m.read_by_team IS NULL) AS unread
    FROM services.threads t JOIN services.clients c ON c.id = t.client_id
    WHERE ($1::text IS NULL OR t.status = $1) AND ($2::uuid IS NULL OR t.client_id = $2) AND ($3::text IS NULL OR t.category = $3)
    ORDER BY (t.status = 'open') DESC, t.last_message_at DESC LIMIT 300`, [st, client, cat])).rows
})
