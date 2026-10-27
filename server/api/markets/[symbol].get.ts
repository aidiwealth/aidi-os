// One symbol: the latest price, the valuation (worked out again when its inputs changed; ?v= shows an older version),
// what today's price means against it, the price history, the beta points, the versions kept and the AI's latest review.
// Missing AI work is started in the background: the market risk premium when none is set, a review when one is due (a
// stock once the premium is in, so its drivers can be applied). The page follows along through /live.
export default defineEventHandler(async (event) => {
  await requireMarkets(event)
  const symbol = normSymbol(getRouterParam(event, 'symbol'))
  if (!symbolOk(symbol)) throw apiError('not_found', 'Not a symbol we know.', 404)
  const i = await ensureInstrument(symbol)
  if (!i) throw apiError('not_found', symbol + ' is not a US-listed stock, ETF or crypto we can price.', 404)
  const vid = String(getQuery(event).v ?? '')
  const latest = await valueSymbol(i)
  const shown = vid && /^[0-9a-f-]{36}$/.test(vid) ? (await valuationById(symbol, vid)) ?? latest : latest
  const q = await quoteOf(i)
  const a = await marketAssumptions()
  const px = await priceSeries(symbol, new Date(Date.now() - 5 * 366 * 86400e3).toISOString().slice(0, 10))
  // Weekly closes for the chart (the last close of each week).
  const weekly: { d: string; close: number }[] = []
  for (const p of px) { const wk = Math.floor(Date.parse(p.d) / (7 * 86400e3)); const last = weekly[weekly.length - 1]; if (last && Math.floor(Date.parse(last.d) / (7 * 86400e3)) === wk) weekly[weekly.length - 1] = p; else weekly.push(p) }
  const watch = !!(await db().query('SELECT 1 FROM markets.watchlist WHERE symbol = $1', [symbol])).rowCount
  const inst = (await marketInstrument(symbol))!
  if (!a.mrp_us.set) kickPremium(event)
  else if ((inst.kind !== 'stock' || latest?.result?.re != null) && (await reviewDue(inst))) kickReview(event, inst)
  const rv = await latestReview(symbol)
  // Key statistics and the business over time (actual years from filings, then the forecast in use).
  const price = q?.price ?? null, ys = inst.kind === 'stock' ? await yearFacts(symbol) : [], lastY = ys[ys.length - 1]
  const bal = inst.info?.balance as { shares?: number | null } | undefined
  const yr = px.filter((p) => p.d >= new Date(Date.now() - 366 * 86400e3).toISOString().slice(0, 10)).map((p) => p.close).concat(price != null ? [price] : [])
  const stats = {
    market_cap: price != null && bal?.shares ? price * bal.shares : null, pe: price != null && lastY?.eps && lastY.eps > 0 ? price / lastY.eps : null,
    div_yield: price && lastY?.dps ? (lastY.dps / price) * 100 : null, eps: lastY?.eps ?? null, revenue: lastY?.revenue ?? null, fy: lastY?.fy ?? null,
    hi52: yr.length ? Math.max(...yr) : null, lo52: yr.length ? Math.min(...yr) : null, beta: latest?.inputs?.beta?.beta ?? null
  }
  const rows = latest?.result?.dcf?.rows as { revenue: number }[] | undefined
  const history = [
    ...ys.filter((y) => y.revenue).map((y) => ({ label: 'FY' + String(y.fy).slice(2), value: y.revenue!, pct: y.ebit != null ? (y.ebit / y.revenue!) * 100 : null })),
    ...(rows && lastY ? rows.map((x, k) => ({ label: 'FY' + String(lastY.fy + k + 1).slice(2), value: x.revenue, pct: latest!.drivers?.margin?.[k] ?? null, forecast: true })) : [])]
  return {
    instrument: { symbol: inst.symbol, name: inst.name, kind: inst.kind, exchange: inst.exchange, sector: inst.sector, universe: inst.universe, no_filings: !!inst.info?.no_filings },
    quote: q, watch, valuation: shown, latest_id: latest?.id ?? null, live: q && shown ? liveSignal(shown, q.price, a.horizon_years.value ?? 3) : null,
    versions: (await valuationVersions(symbol)).map((v) => ({ ...v, fair_value: v.fair_value == null ? null : Number(v.fair_value) })),
    chart: weekly, mrp_set: a.mrp_us.set, mrp_by: a.mrp_us.set_by, horizon: a.horizon_years.value ?? 3,
    stats, history, review: rv, review_running: reviewRunning(symbol) || (!a.mrp_us.set && !!useRuntimeConfig().anthropicApiKey), ai_on: !!useRuntimeConfig().anthropicApiKey
  }
})
