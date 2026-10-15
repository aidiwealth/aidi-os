// GET /api/v1/forecasts — saved forecasts with base, best and worst case results; ?name= adds one forecast's months.
export default defineEventHandler(async (event) => {
  const k = await requireApiKey(event, 'read')
  const q = getQuery(event)
  return { data: await finvryData(event, k.kind, 'forecasts', q.name ? { name: String(q.name).slice(0, 80) } : {}) }
})
