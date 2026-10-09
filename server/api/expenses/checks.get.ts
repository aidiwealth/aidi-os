// Cross-checks for Payments: bank statements, financial statements and receipts.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  return await paymentChecks()
})
