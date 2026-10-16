// Notices, paged: by status tab, with search, company and "needs" filters (overdue, due soon, has an action).
export default defineEventHandler(async (event) => {
  const me = await requireRole(event, 'admin', 'gp', 'team')
  const q = getQuery(event)
  const status = ['new', 'done', 'archived', 'all'].includes(String(q.status)) ? String(q.status) : 'new'
  const search = String(q.q ?? '').trim().slice(0, 100)
  const entity = /^[0-9a-f-]{36}$/.test(String(q.entity ?? '')) ? String(q.entity) : ''
  const need = ['overdue', 'soon', 'action', 'due'].includes(String(q.need)) ? String(q.need) : ''
  const size = [25, 50, 100].includes(Number(q.size)) ? Number(q.size) : 25
  const page = Math.max(1, Math.floor(Number(q.page) || 1))
  const ACTION = "(n.action IS NOT NULL AND n.action !~* '^\\s*no action')"
  const where = `WHERE ($1 = 'all' OR n.status = $1)
      AND ($2 = '' OR n.subject ILIKE '%' || $2 || '%' OR n.summary ILIKE '%' || $2 || '%' OR n.from_name ILIKE '%' || $2 || '%' OR n.from_email ILIKE '%' || $2 || '%')
      AND ($3 = '' OR n.entity_id::text = $3)
      AND ($4 = '' OR ($4 = 'overdue' AND n.due_date < current_date) OR ($4 = 'soon' AND n.due_date BETWEEN current_date AND current_date + 14)
           OR ($4 = 'due' AND n.due_date IS NOT NULL) OR ($4 = 'action' AND ${ACTION}))`
  const args = [status, search, entity, need]
  const total = Number((await db().query<{ n: number }>(`SELECT count(*)::int AS n FROM inbox.notices n ${where}`, args)).rows[0]?.n ?? 0)
  const pages = Math.max(1, Math.ceil(total / size)), pg = Math.min(page, pages)
  const rows = (await db().query(`SELECT n.id, n.from_name, n.from_email, n.subject, n.received_at, n.status, n.summary, n.action, ${ACTION} AS needs_action, to_char(n.due_date, 'YYYY-MM-DD') AS due_date, n.entity_id, e.name AS entity, jsonb_array_length(n.attachments) AS files
    FROM inbox.notices n LEFT JOIN core.entities e ON e.id = n.entity_id ${where} ORDER BY n.received_at DESC LIMIT ${size} OFFSET ${(pg - 1) * size}`, args)).rows
  const counts = (await db().query('SELECT status, count(*)::int AS n FROM inbox.notices GROUP BY status')).rows
  const k = (await db().query<{ overdue: number; soon: number; action: number }>(`SELECT count(*) FILTER (WHERE n.due_date < current_date)::int AS overdue, count(*) FILTER (WHERE n.due_date BETWEEN current_date AND current_date + 14)::int AS soon,
      count(*) FILTER (WHERE ${ACTION})::int AS action FROM inbox.notices n WHERE n.status = 'new'`)).rows[0]
  const base = brands().aidi.url, tok = useRuntimeConfig().inboundEmailToken as string
  return { rows, total, page: pg, pages, size, counts, open: k, webhook: tok && me.roles.includes('admin') ? base + '/api/public/webhooks/inbound-email?token=' + tok : null, settings: await noticeSettings(), can_edit: me.roles.includes('admin') }
})
