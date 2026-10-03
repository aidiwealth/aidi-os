// Billing settings: who issues invoices, numbering, payment terms and how customers pay.
import { z } from 'zod'
const Body = z.object({
  issuer_name: z.string().trim().min(1).max(200), issuer_address: z.string().trim().max(500), issuer_email: z.string().trim().max(254),
  invoice_prefix: z.string().trim().regex(/^[A-Z0-9]{2,8}$/), payment_terms_days: z.coerce.number().int().min(0).max(120), payment_instructions: z.string().trim().max(3000)
})
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  if (staff.staffRole !== 'owner') throw apiError('forbidden', 'Only the platform owner can change billing settings.', 403)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the fields. The invoice prefix is 2 to 8 capital letters or numbers.')
  await asPlatform(() => db().query("INSERT INTO platform.settings (key, value, updated_by, updated_at) VALUES ('billing', $1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()", [JSON.stringify(b.data), staff.userId]))
  await platformAudit(event, staff.userId, 'billing_settings', null, { prefix: b.data.invoice_prefix })
  return { ok: true }
})
