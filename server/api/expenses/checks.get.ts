// Cross-checks for Payments: bank statements, financial statements and receipts.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const { hr_by_id: _h, ledger: _l, ...out } = await paymentChecks()
  return out
})
