import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Invoice not found', 404)
  const inv = await loadCsInvoice(id.data)
  if (!inv) throw apiError('not_found', 'Invoice not found', 404)
  const org = await currentOrg()
  return { invoice: inv, online: csProviders(inv.currency, org?.settings.brand), link: await billUrl(inv.id) }
})
