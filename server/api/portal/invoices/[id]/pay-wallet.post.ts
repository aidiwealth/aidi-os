// Pay a service invoice from the company's wallet (same currency only).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const r = await payInvoiceFromWallet(id.data, { clientId: u.clientId, userId: u.userId ?? null })
  await audit({ event, actorUserId: u.userId ?? null, action: 'services.invoice_paid_wallet', objectType: 'invoice', objectId: id.data })
  return { ok: true, ...r }
})
