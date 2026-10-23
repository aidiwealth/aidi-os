// The cut list: keep a recurring payment, mark it to cancel (with a reminder date), or record it as cancelled.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ vendor_key: z.string().min(1).max(80), status: z.enum(['keep', 'to_cancel', 'cancelled']), remind_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), note: z.string().trim().max(500).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose what to do with this payment.')
  const d = b.data
  await db().query(`INSERT INTO banking.vendors (vendor_key, status, remind_on, note, updated_by) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (organization_id, vendor_key) DO UPDATE SET status = EXCLUDED.status, remind_on = EXCLUDED.remind_on, note = coalesce(EXCLUDED.note, banking.vendors.note), updated_by = EXCLUDED.updated_by, updated_at = now()`, [d.vendor_key, d.status, d.status === 'to_cancel' ? d.remind_on ?? null : null, d.note ?? null, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'treasury.cut_list', objectType: 'bank_vendor', detail: { vendor: d.vendor_key, status: d.status, remind_on: d.remind_on ?? null } })
  return { ok: true }
})
