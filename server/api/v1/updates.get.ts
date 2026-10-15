// GET /api/v1/updates — recent investor updates: title, period, status, when sent and to how many.
export default defineEventHandler(async (event) => {
  const k = await requireApiKey(event, 'read')
  return { data: await finvryData(event, k.kind, 'investor_updates') }
})
