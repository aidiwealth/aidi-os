// The tax rules, for showing subtotal, VAT and total while an invoice is being written.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return (await taxRates()).filter((r) => r.enabled)
})
