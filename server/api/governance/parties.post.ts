// Add a party, edit one, or end their role (end_date). Admins and family members manage the register.
import { z } from 'zod'
const Body = z.object({
  id: z.string().uuid().optional(),
  entity_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254).optional().or(z.literal('').transform(() => undefined)),
  role: z.enum(PARTY_ROLES),
  share_pct: z.coerce.number().min(0).max(100).optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().trim().max(1000).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null))
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'family')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add a name and role. Email is needed for anyone who signs.')
  const d = b.data
  if (isSigningRole(d.role) && !d.email) throw apiError('email', 'Signatories (trustees, protectors, directors, members, signatories) need an email so they can approve in Aidi OS.')
  const vals = [d.entity_id, d.name, d.email?.toLowerCase() ?? null, d.role, d.share_pct ?? null, d.notes || null, d.start_date ?? null, d.end_date ?? null]
  const row = d.id
    ? await one<{ id: string }>('UPDATE governance.parties SET entity_id=$2, name=$3, email=$4, role=$5, share_pct=$6, notes=$7, start_date=$8, end_date=$9 WHERE id=$1 RETURNING id', [d.id, ...vals])
    : await one<{ id: string }>('INSERT INTO governance.parties (entity_id, name, email, role, share_pct, notes, start_date, end_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [...vals, user.userId])
  await audit({ event, actorUserId: user.userId, action: d.id ? 'governance.party_update' : 'governance.party_add', objectType: 'party', objectId: row.id, entityId: d.entity_id, detail: { name: d.name, role: d.role, end_date: d.end_date ?? null } })
  return { ok: true, id: row.id }
})
