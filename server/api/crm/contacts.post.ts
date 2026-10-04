// Create or update a contact: { id?, name, email, firm, title, phone, subscribed, custom, list_ids }
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().email().max(254), firm: z.string().trim().max(200).default(''), title: z.string().trim().max(120).default(''),
    phone: z.string().trim().max(40).default(''), subscribed: z.boolean().default(true), custom: z.record(z.string(), z.string().max(500)).default({}), list_ids: z.array(z.string().uuid()).max(50).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add a name and a valid email.')
  const d = b.data, args = [d.name, d.email, d.firm || null, d.title || null, d.phone || null, d.subscribed, JSON.stringify(d.custom)]
  let id = d.id
  try {
    if (id) await db().query('UPDATE crm.contacts SET name = $2, email = $3, firm = $4, title = $5, phone = $6, subscribed = $7, custom = $8 WHERE id = $1', [id, ...args])
    else id = (await one<{ id: string }>('INSERT INTO crm.contacts (name, email, firm, title, phone, subscribed, custom) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', args)).id
  } catch (err) { if (String((err as Error).message).includes('duplicate')) throw apiError('exists', 'A contact with that email already exists.', 409); throw err }
  if (d.list_ids) { await db().query('DELETE FROM crm.list_members WHERE contact_id = $1', [id]); for (const l of d.list_ids) await db().query('INSERT INTO crm.list_members (list_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [l, id]) }
  return { ok: true, id }
})
