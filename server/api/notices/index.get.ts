export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const status = String(getQuery(event).status ?? 'new')
  const rows = (await db().query("SELECT n.id, n.from_name, n.from_email, n.subject, n.received_at, n.status, n.summary, n.action, to_char(n.due_date, 'YYYY-MM-DD') AS due_date, n.entity_id, e.name AS entity, jsonb_array_length(n.attachments) AS files FROM inbox.notices n LEFT JOIN core.entities e ON e.id = n.entity_id WHERE ($1 = 'all' OR n.status = $1) ORDER BY n.received_at DESC LIMIT 300", [['new', 'done', 'archived', 'all'].includes(status) ? status : 'new'])).rows
  const counts = (await db().query("SELECT status, count(*)::int AS n FROM inbox.notices GROUP BY status")).rows
  const base = brands().aidi.url, tok = useRuntimeConfig().inboundEmailToken as string
  return { rows, counts, webhook: tok ? base + '/api/public/webhooks/inbound-email?token=' + tok : null }
})
