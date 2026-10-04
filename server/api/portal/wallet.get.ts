// The company's wallet balance, for paying invoices and orders from Services.
export default defineEventHandler(async (event) => {
  await requirePortal(event)
  const s = await readSession(event)
  const w = s?.orgId ? await walletOf(s.orgId) : null
  return w ? { currency: w.currency, balance_minor: w.balance_minor } : null
})
