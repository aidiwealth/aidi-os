// Add or edit an LP.
import { z } from 'zod'
const Body = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), kind: z.enum(['individual', 'entity', 'institution', 'gp']).default('individual'),
  contact_name: z.string().trim().max(200).optional(), email: z.string().trim().email().max(254).optional().or(z.literal('').transform(() => undefined)),
  country: z.string().trim().max(100).optional(), kyc_status: z.enum(['pending', 'approved', 'expired']).default('pending'), notes: z.string().trim().max(3000).optional()
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the LP name and a valid email.')
  const d = b.data, vals = [d.name, d.kind, d.contact_name || null, d.email?.toLowerCase() ?? null, d.country || null, d.kyc_status, d.notes || null]
  const r = d.id
    ? await db().query<{ id: string }>('UPDATE funds.lps SET name=$2, kind=$3, contact_name=$4, email=$5, country=$6, kyc_status=$7, notes=$8 WHERE id=$1 RETURNING id', [d.id, ...vals])
    : await db().query<{ id: string }>('INSERT INTO funds.lps (name, kind, contact_name, email, country, kyc_status, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [...vals, user.userId])
  if (!r.rows[0]) throw apiError('not_found', 'LP not found', 404)
  await audit({ event, actorUserId: user.userId, action: d.id ? 'funds.lp_update' : 'funds.lp_add', objectType: 'lp', objectId: r.rows[0].id })
  return { ok: true, id: r.rows[0].id }
})
