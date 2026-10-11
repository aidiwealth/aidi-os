import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Invoice not found', 404)
  const inv = await loadCsInvoice(id.data)
  if (!inv) throw apiError('not_found', 'Invoice not found', 404)
  const org = await currentOrg()
  const cid = (await db().query<{ client_id: string }>('SELECT client_id FROM services.invoices WHERE id = $1', [id.data])).rows[0]?.client_id
  return { invoice: inv, wallet: cid ? await clientWallet(cid) : null, online: csProviders(inv.currency, org?.settings.brand), link: await billUrl(inv.id) }
})
