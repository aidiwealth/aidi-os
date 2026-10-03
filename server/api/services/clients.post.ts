// Add or edit a client.
import { z } from 'zod'
const Body = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), kind: z.enum(['company', 'individual']).default('company'),
  contact_name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254), phone: z.string().trim().max(40).optional(),
  country: z.string().trim().max(100).optional(), address: z.string().trim().max(500).optional(), notes: z.string().trim().max(3000).optional(), status: z.enum(['lead', 'active', 'inactive']).default('active')
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the client name, a contact name and a valid email.')
  const d = b.data, vals = [d.name, d.kind, d.contact_name, d.email.toLowerCase(), d.phone || null, d.country || null, d.address || null, d.notes || null, d.status]
  const r = d.id
    ? await db().query<{ id: string }>('UPDATE services.clients SET name=$2, kind=$3, contact_name=$4, email=$5, phone=$6, country=$7, address=$8, notes=$9, status=$10 WHERE id=$1 RETURNING id', [d.id, ...vals])
    : await db().query<{ id: string }>('INSERT INTO services.clients (name, kind, contact_name, email, phone, country, address, notes, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [...vals, user.userId])
  if (!r.rows[0]) throw apiError('not_found', 'Client not found', 404)
  await audit({ event, actorUserId: user.userId, action: d.id ? 'services.client_update' : 'services.client_add', objectType: 'client', objectId: r.rows[0].id })
  return { ok: true, id: r.rows[0].id }
})
