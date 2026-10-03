// The pay page's data: the invoice, how it can be paid, and (after Paystack sends the customer back) the result.
export default defineEventHandler(async (event) => {
  const id = invoiceIdFromToken(String(getRouterParam(event, 'token') ?? ''))
  if (!id) throw apiError('invalid_link', 'This payment link is not valid.', 404)
  const ref = String(getQuery(event).ref ?? '')
  if (ref && paystackOn()) { try { await paystackVerify(ref) } catch (err) { console.error('[pay] verify failed', err) } }
  const inv = await loadInvoice(id)
  if (!inv || inv.status === 'draft') throw apiError('invalid_link', 'This payment link is not valid.', 404)
  setOrgContext(inv.organization_id)
  const ws = await publicWorkspace()
  return {
    number: inv.number, customer: inv.customer, amount: inv.amount, currency: inv.currency, issue_date: inv.issue_date, due_date: inv.due_date, lines: inv.lines,
    status: inv.overdue ? 'overdue' : inv.status, issuer: (await billingSettings()).issuer_name, providers: inv.status === 'sent' ? providersFor(inv.currency) : [], workspace: ws
  }
})
