// Contacts with their lists and last activity, a page at a time. ?q= search, ?list= list id, ?page= (from 1), ?size=.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const q = z.object({ q: z.string().max(100).default(''), list: z.string().max(40).default(''), page: z.coerce.number().int().min(1).max(100000).default(1), size: z.coerce.number().int().refine((n) => [25, 50, 100, 200].includes(n)).default(50) }).parse(getQuery(event))
  const f = contactFilter(q.q, q.list)
  const total = (await db().query<{ n: number }>(`SELECT count(*)::int AS n FROM crm.contacts c ${f.where}`, f.args)).rows[0]?.n ?? 0
  const pages = Math.max(1, Math.ceil(total / q.size)), page = Math.min(q.page, pages)
  const rows = await db().query(`SELECT c.id, c.name, c.email, c.firm, c.title, c.subscribed, c.created_at,
      coalesce((SELECT json_agg(json_build_object('id', l.id, 'name', l.name) ORDER BY l.name) FROM crm.list_members m JOIN crm.lists l ON l.id = m.list_id WHERE m.contact_id = c.id), '[]') AS lists,
      (SELECT max(a.created_at) FROM crm.activity a WHERE a.contact_id = c.id) AS last_activity
    FROM crm.contacts c ${f.where} ORDER BY c.created_at DESC, c.id LIMIT ${q.size} OFFSET ${(page - 1) * q.size}`, f.args)
  const lists = await db().query('SELECT l.id, l.name, (SELECT count(*)::int FROM crm.list_members m WHERE m.list_id = l.id) AS n FROM crm.lists l ORDER BY l.name')
  const all = (await db().query<{ n: number }>('SELECT count(*)::int AS n FROM crm.contacts')).rows[0]?.n ?? 0
  const fields = await db().query('SELECT id, key, label, type, options FROM crm.fields ORDER BY sort, label')
  return { contacts: rows.rows, total, all, page, pages, size: q.size, lists: lists.rows, fields: fields.rows }
})
