// Bulk actions on contacts: add to / remove from a list, subscribe, unsubscribe, delete. Either the ticked contacts
// (ids) or every contact matching a search and list filter (match: { q, list }).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ ids: z.array(z.string().uuid()).max(1000).optional(), match: z.object({ q: z.string().max(100).default(''), list: z.string().max(40).default('') }).optional(),
    action: z.enum(['add_list', 'remove_list', 'subscribe', 'unsubscribe', 'delete']), list_id: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success || (!b.data.ids?.length && !b.data.match)) throw apiError('invalid', 'Choose contacts and an action.')
  const { action, list_id } = b.data
  if ((action === 'add_list' || action === 'remove_list') && !list_id) throw apiError('invalid', 'Choose a list.')
  let ids = b.data.ids ?? []
  if (b.data.match) { const f = contactFilter(b.data.match.q, b.data.match.list); ids = (await db().query<{ id: string }>(`SELECT c.id FROM crm.contacts c ${f.where}`, f.args)).rows.map((r) => r.id) }
  if (!ids.length) return { ok: true, count: 0 }
  if (action === 'add_list') await db().query('INSERT INTO crm.list_members (list_id, contact_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING', [list_id, ids])
  if (action === 'remove_list') await db().query('DELETE FROM crm.list_members WHERE list_id = $1 AND contact_id = ANY($2::uuid[])', [list_id, ids])
  if (action === 'subscribe' || action === 'unsubscribe') await db().query('UPDATE crm.contacts SET subscribed = $2 WHERE id = ANY($1::uuid[])', [ids, action === 'subscribe'])
  if (action === 'delete') await db().query('DELETE FROM crm.contacts WHERE id = ANY($1::uuid[])', [ids])
  return { ok: true, count: ids.length }
})
