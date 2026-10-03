// Send the customer to Stripe or Paystack to pay.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  const id = invoiceIdFromToken(token)
  const b = z.object({ provider: z.enum(['stripe', 'paystack']) }).safeParse(await readBody(event))
  if (!id || !b.success) throw apiError('invalid_link', 'This payment link is not valid.', 404)
  const inv = await loadInvoice(id)
  if (!inv || inv.status === 'draft' || inv.status === 'void') throw apiError('invalid_link', 'This payment link is not valid.', 404)
  if (inv.status === 'paid') throw apiError('paid', 'This invoice is already paid.', 409)
  const url = await startCheckout(inv, b.data.provider, await payUrl(inv.id, inv.organization_id))
  return { url }
})
