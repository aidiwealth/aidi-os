// The founder's messages: the current conversation (or ?thread=), past conversations, attachments. Marks team replies read.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const want = String(getQuery(event).thread ?? '')
  const threads = await db().query<{ id: string; status: string }>("SELECT id, subject, status, opened_at, closed_at, closed_by, last_message_at, (SELECT count(*)::int FROM services.messages m WHERE m.thread_id = t.id) AS n FROM services.threads t WHERE client_id = $1 ORDER BY (status = 'open') DESC, last_message_at DESC LIMIT 100", [u.clientId])
  const cur = threads.rows.find((t) => t.id === want) ?? threads.rows.find((t) => t.status === 'open') ?? null
  const msgs = cur ? (await db().query(`SELECT m.id, m.from_team, m.body, m.created_at, coalesce(pp.full_name, sp.name) AS author, d.id AS doc_id, split_part(d.title, ' — ', 2) AS doc_name, d.size_bytes AS doc_size FROM services.messages m
      LEFT JOIN core.users uu ON uu.id = m.author_user_id LEFT JOIN core.people pp ON pp.id = uu.person_id LEFT JOIN services.people sp ON sp.id = m.author_person_id LEFT JOIN core.documents d ON d.id = m.document_id
      WHERE m.thread_id = $1 ORDER BY m.created_at`, [cur.id])).rows : []
  await db().query('UPDATE services.messages SET read_by_client = now() WHERE client_id = $1 AND from_team AND read_by_client IS NULL', [u.clientId])
  return { thread: cur, threads: threads.rows, messages: msgs }
})
