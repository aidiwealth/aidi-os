// Contacts with their lists and last activity. ?q= search, ?list= list id.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const q = z.object({ q: z.string().max(100).default(''), list: z.string().max(40).default('') }).parse(getQuery(event))
  const args: unknown[] = [], where: string[] = []
  if (q.q) { args.push('%' + q.q.toLowerCase() + '%'); where.push('(lower(c.name) LIKE $' + args.length + ' OR c.email LIKE $' + args.length + ' OR lower(coalesce(c.firm, \'\')) LIKE $' + args.length + ')') }
  if (/^[0-9a-f-]{36}$/.test(q.list)) { args.push(q.list); where.push('EXISTS (SELECT 1 FROM crm.list_members m WHERE m.contact_id = c.id AND m.list_id = $' + args.length + ')') }
  const rows = await db().query(`SELECT c.id, c.name, c.email, c.firm, c.title, c.subscribed, c.created_at,
      coalesce((SELECT json_agg(json_build_object('id', l.id, 'name', l.name) ORDER BY l.name) FROM crm.list_members m JOIN crm.lists l ON l.id = m.list_id WHERE m.contact_id = c.id), '[]') AS lists,
      (SELECT max(a.created_at) FROM crm.activity a WHERE a.contact_id = c.id) AS last_activity
    FROM crm.contacts c ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.created_at DESC LIMIT 1000`, args)
  const lists = await db().query('SELECT l.id, l.name, (SELECT count(*)::int FROM crm.list_members m WHERE m.list_id = l.id) AS n FROM crm.lists l ORDER BY l.name')
  const fields = await db().query('SELECT id, key, label, type, options FROM crm.fields ORDER BY sort, label')
  return { contacts: rows.rows, lists: lists.rows, fields: fields.rows }
})
