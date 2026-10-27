// One pre-IPO deal: its terms, value range, AI review and how much each account could put in.
export default defineEventHandler(async (event) => {
  await requireMarkets(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found.', 404)
  const d = (await privateDeals(id))[0]
  if (!d) throw apiError('not_found', 'Deal not found.', 404)
  return { deal: { ...d, signal_label: privateSignalLabel(d.signal) }, sizing: await privateSizing(d) }
})
