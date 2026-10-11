// One wealth invoice for the team: the invoice (Aidi layout), its documents and pay link.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Invoice not found.', 404)
  const v = await wmInvoiceView(id)
  if (!v) throw apiError('not_found', 'Invoice not found.', 404)
  return v
})
