// A client invoice opened from its pay link: the invoice, how to pay online, and bank transfer details.
export default defineEventHandler(async (event) => {
  const id = billIdFromToken(String(getRouterParam(event, 'token') ?? ''))
  if (!id) throw apiError('invalid_link', 'This link is not valid.', 404)
  const org = await asPlatform(() => db().query<{ organization_id: string }>("SELECT organization_id FROM services.invoices WHERE id = $1 AND status <> 'draft'", [id]))
  if (!org.rows[0]) throw apiError('invalid_link', 'This link is not valid.', 404)
  setOrgContext(org.rows[0].organization_id)
  const ref = String(getQuery(event).ref ?? '')
  if (ref.startsWith('cs_') && paystackOn()) { try { if ((await paystackStatus(ref)) === 'success') await csPaymentSucceeded(ref) } catch (err) { console.error('[bill] verify failed', err) } }
  setOrgContext(org.rows[0].organization_id)
  const inv = await loadCsInvoice(id)
  if (!inv) throw apiError('invalid_link', 'This link is not valid.', 404)
  const o = await currentOrg()
  return { invoice: { ...inv, organization_id: undefined, client_id: undefined, company_id: undefined }, providers: inv.status === 'sent' ? csProviders(inv.currency, o?.settings.brand) : [], workspace: await publicWorkspace() }
})
