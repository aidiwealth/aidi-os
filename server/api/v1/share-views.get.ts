// GET /api/v1/share-views — who opened your private forecast and cap table links, when and for how long.
export default defineEventHandler(async (event) => {
  const k = await requireApiKey(event, 'read')
  return { data: await finvryData(event, k.kind, 'share_link_views') }
})
