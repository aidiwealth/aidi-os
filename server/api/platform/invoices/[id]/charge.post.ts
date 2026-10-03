// Charge the customer's saved card for this invoice now.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Invoice not found', 404)
  const inv = await loadInvoice(id.data)
  if (!inv) throw apiError('not_found', 'Invoice not found', 404)
  if (inv.status !== 'sent' && inv.status !== 'draft') throw apiError('state', 'This invoice is ' + inv.status + '.')
  const r = await chargeSaved(inv)
  await platformAudit(event, staff.userId, 'invoice_charge', inv.organization_id, { number: inv.number, ok: r.ok, reason: r.reason ?? null })
  if (!r.ok) throw apiError('charge_failed', 'The charge did not go through: ' + (r.reason ?? 'unknown reason'), 402)
  return { ok: true }
})
