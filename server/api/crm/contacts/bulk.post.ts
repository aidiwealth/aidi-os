// Bulk actions on contacts: add to / remove from a list, subscribe, unsubscribe, delete.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000), action: z.enum(['add_list', 'remove_list', 'subscribe', 'unsubscribe', 'delete']), list_id: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose contacts and an action.')
  const { ids, action, list_id } = b.data
  if ((action === 'add_list' || action === 'remove_list') && !list_id) throw apiError('invalid', 'Choose a list.')
  if (action === 'add_list') for (const id of ids) await db().query('INSERT INTO crm.list_members (list_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [list_id, id])
  if (action === 'remove_list') await db().query('DELETE FROM crm.list_members WHERE list_id = $1 AND contact_id = ANY($2::uuid[])', [list_id, ids])
  if (action === 'subscribe' || action === 'unsubscribe') await db().query('UPDATE crm.contacts SET subscribed = $2 WHERE id = ANY($1::uuid[])', [ids, action === 'subscribe'])
  if (action === 'delete') await db().query('DELETE FROM crm.contacts WHERE id = ANY($1::uuid[])', [ids])
  return { ok: true }
})
