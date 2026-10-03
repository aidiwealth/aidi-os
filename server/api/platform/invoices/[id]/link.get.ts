// The invoice's pay link, to share with the customer.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Invoice not found', 404)
  const inv = await loadInvoice(id.data)
  if (!inv) throw apiError('not_found', 'Invoice not found', 404)
  return { url: await payUrl(inv.id, inv.organization_id), providers: providersFor(inv.currency) }
})
