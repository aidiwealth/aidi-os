// Support email threads (support@finvry.com), for the Services desk.
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const status = getQuery(event).status === 'closed' ? 'closed' : 'open'
  const rows = (await db().query<{ workspace_id: string | null; [k: string]: unknown }>(`SELECT t.id, t.subject, t.from_email, t.from_name, t.status, t.unread, t.last_message_at, t.workspace_id,
      (SELECT left(coalesce(m.text_body, regexp_replace(coalesce(m.html_body, ''), '<[^>]+>', ' ', 'g')), 140) FROM support.messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last,
      (SELECT count(*)::int FROM support.messages m WHERE m.thread_id = t.id) AS n
    FROM support.threads t WHERE t.status = $1 ORDER BY t.last_message_at DESC LIMIT 300`, [status])).rows
  const ids = [...new Set(rows.map((r) => r.workspace_id).filter(Boolean))] as string[]
  const names = ids.length ? new Map((await asPlatform(() => db().query<{ id: string; name: string }>('SELECT id, name FROM core.organizations WHERE id = ANY($1)', [ids]))).rows.map((o) => [o.id, o.name])) : new Map<string, string>()
  return rows.map((r) => ({ ...r, workspace: r.workspace_id ? names.get(r.workspace_id) ?? null : null }))
})
