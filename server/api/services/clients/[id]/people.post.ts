// Add or edit a person at the client (contact, owner, director or officer).
import { z } from 'zod'
const Body = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254).optional().or(z.literal('').transform(() => undefined)),
  phone: z.string().trim().max(40).optional(), role: z.enum(['contact', 'owner', 'director', 'officer', 'other']).default('contact'),
  ownership_pct: z.union([z.coerce.number().min(0).max(100), z.literal('').transform(() => null), z.null()]).optional(), company_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  address: z.string().trim().max(500).optional(), nationality: z.string().trim().max(100).optional(), portal_access: z.boolean().default(false)
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const cid = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!cid.success || !b.success) throw apiError('invalid', 'Add the name; check the email and ownership.')
  const d = b.data
  if (d.portal_access && !d.email) throw apiError('invalid', 'Finvry access needs an email address (sign-in is by emailed code).')
  if (d.company_id && !(await db().query('SELECT 1 FROM services.companies WHERE id = $1 AND client_id = $2', [d.company_id, cid.data])).rowCount) throw apiError('invalid', 'Choose one of this client\'s companies.')
  const vals = [d.name, d.email?.toLowerCase() ?? null, d.phone || null, d.role, d.ownership_pct ?? null, d.company_id ?? null, d.address || null, d.nationality || null, d.portal_access]
  const r = d.id
    ? await db().query<{ id: string }>('UPDATE services.people SET name=$3, email=$4, phone=$5, role=$6, ownership_pct=$7, company_id=$8, address=$9, nationality=$10, portal_access=$11 WHERE id=$1 AND client_id=$2 RETURNING id', [d.id, cid.data, ...vals])
    : await db().query<{ id: string }>('INSERT INTO services.people (client_id, name, email, phone, role, ownership_pct, company_id, address, nationality, portal_access) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [cid.data, ...vals])
  if (!r.rows[0]) throw apiError('not_found', 'Person not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'services.person_save', objectType: 'client', objectId: cid.data, detail: { person: d.name } })
  return { ok: true, id: r.rows[0].id }
})
