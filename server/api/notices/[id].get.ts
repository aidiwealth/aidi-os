export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const n = (await db().query("SELECT id, from_name, from_email, to_email, subject, text_body, html_body, received_at, status, summary, action, to_char(due_date, 'YYYY-MM-DD') AS due_date, entity_id, attachments FROM inbox.notices WHERE id = $1", [id])).rows[0]
  if (!n) throw apiError('not_found', 'Not found', 404)
  return n
})
