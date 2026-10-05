// GET /api/v1/contacts[?updated_since=ISO] — your contacts with their lists.
export default defineEventHandler(async (event) => {
  await requireApiKey(event, 'read')
  const since = String(getQuery(event).updated_since ?? '')
  const r = await db().query(`SELECT c.id, c.name, c.email, c.firm, c.title, c.phone, c.subscribed, c.custom, c.created_at, coalesce((SELECT json_agg(l.name) FROM crm.list_members m JOIN crm.lists l ON l.id = m.list_id WHERE m.contact_id = c.id), '[]') AS lists
    FROM crm.contacts c ${/^\d{4}-\d{2}-\d{2}/.test(since) ? 'WHERE c.created_at >= $1' : ''} ORDER BY c.created_at DESC LIMIT 5000`, /^\d{4}-\d{2}-\d{2}/.test(since) ? [since] : [])
  return { data: r.rows }
})
