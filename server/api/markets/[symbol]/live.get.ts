// What an open page polls (every 15 seconds while visible): the latest price and the margin of safety and signal at that
// price, plus markers that tell the page to reload when the AI has finished a review or a new version was saved.
export default defineEventHandler(async (event) => {
  await requireMarkets(event)
  const symbol = normSymbol(getRouterParam(event, 'symbol'))
  const i = symbolOk(symbol) ? await marketInstrument(symbol) : null
  if (!i) throw apiError('not_found', 'Not found.', 404)
  const [q, v, a, rv] = await Promise.all([quoteOf(i), valuationById(symbol), marketAssumptions(), latestReview(symbol)])
  return { quote: q, live: q && v ? liveSignal(v, q.price, a.horizon_years.value ?? 3) : null, version_id: v?.id ?? null, review_id: rv?.id ?? null, review_applied: rv?.applied ?? false, review_running: reviewRunning(symbol), mrp_set: a.mrp_us.set }
})
