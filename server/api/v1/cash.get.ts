// GET /api/v1/cash — live cash from connected bank accounts (bank feed, read-only): balances, money in and out by month, net burn.
export default defineEventHandler(async (event) => {
  const k = await requireApiKey(event, 'read')
  return { data: await finvryData(event, k.kind, 'bank_cash') }
})
