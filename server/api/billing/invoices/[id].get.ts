// One invoice, for printing: Aidi platform staff (on the Aidi OS address) or an admin of the invoiced workspace.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const s = await requireUser(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Invoice not found', 404)
  const inv = await loadInvoice(id.data)
  if (!inv) throw apiError('not_found', 'Invoice not found', 404)
  const staff = s.platform && hostBrand(event) === 'aidi'
  const ownAdmin = s.orgId === inv.organization_id && s.roles.includes('admin')
  if (!staff && !ownAdmin) throw apiError('not_found', 'Invoice not found', 404)
  if (!staff && inv.status === 'draft') throw apiError('not_found', 'Invoice not found', 404)
  return { invoice: inv, issuer: await billingSettings() }
})
