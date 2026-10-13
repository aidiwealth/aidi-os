// A lease on a non-Airbnb unit: tenant, rent, due day, deposit, dates (admins). Rent charges follow from it.
import { z } from 'zod'
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), unit_id: z.string().uuid().optional(), tenant_name: z.string().trim().min(1).max(200).optional(), tenant_email: z.string().trim().max(254).optional().nullable(), tenant_phone: z.string().trim().max(40).optional().nullable(),
    rent: z.coerce.number().min(0).optional(), due_day: z.coerce.number().int().min(1).max(28).default(1), deposit: z.coerce.number().min(0).optional().nullable().or(z.literal('').transform(() => null)), starts_on: date.optional(), ends_on: date.optional().nullable().or(z.literal('').transform(() => null)), status: z.enum(['active', 'ended']).default('active'), notes: z.string().trim().max(2000).optional().nullable() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the lease: tenant, rent, due day and start date.')
  const d = b.data
  if (d.delete && d.id) { await db().query('DELETE FROM rentals.leases WHERE id = $1', [d.id]); return { ok: true } }
  if (!d.tenant_name || d.rent === undefined || !d.starts_on) throw apiError('invalid', 'Add the tenant, rent and start date.')
  const vals = [d.tenant_name, d.tenant_email || null, d.tenant_phone || null, d.rent, d.due_day, d.deposit ?? null, d.starts_on, d.ends_on ?? null, d.status, d.notes || null]
  const id = d.id
    ? (await db().query<{ id: string }>('UPDATE rentals.leases SET tenant_name=$2, tenant_email=$3, tenant_phone=$4, rent=$5, due_day=$6, deposit=$7, starts_on=$8, ends_on=$9, status=$10, notes=$11 WHERE id=$1 RETURNING id', [d.id, ...vals])).rows[0]?.id
    : (await one<{ id: string }>('INSERT INTO rentals.leases (unit_id, tenant_name, tenant_email, tenant_phone, rent, due_day, deposit, starts_on, ends_on, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id', [d.unit_id, ...vals])).id
  if (d.id) await db().query("UPDATE rentals.rent_charges SET amount = $2 WHERE lease_id = $1 AND paid_amount IS NULL AND due_on >= current_date", [d.id, d.rent])
  await ensureRentCharges()
  await audit({ event, actorUserId: user.userId, action: 'rentals.lease_saved', objectType: 'rental_lease', objectId: id })
  return { ok: true, id }
})
