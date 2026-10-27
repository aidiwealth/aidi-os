// The price chart for a range: 1D and 1W from intraday bars (daily closes if those are not available), 1M to 5Y from
// daily closes (5Y as weekly closes). `base` is the line the change is measured from (yesterday's close for 1D).
export default defineEventHandler(async (event) => {
  await requireMarkets(event)
  const symbol = normSymbol(getRouterParam(event, 'symbol'))
  const i = symbolOk(symbol) ? await marketInstrument(symbol) : null
  if (!i) throw apiError('not_found', 'Not found.', 404)
  const R = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y'] as const
  const r = (R as readonly string[]).includes(String(getQuery(event).r)) ? String(getQuery(event).r) as typeof R[number] : '1Y'
  const q = await quoteOf(i)
  if (r === '1D' || r === '1W') {
    const pts = await intradayPrices(i, r)
    if (pts && pts.length > 1) return { range: r, intraday: true, points: pts, base: r === '1D' ? q?.prev_close ?? pts[0]!.v : pts[0]!.v }
  }
  const days: Record<string, number> = { '1D': 5, '1W': 8, '1M': 31, '3M': 92, '1Y': 366, '5Y': 5 * 366 }
  const from = r === 'YTD' ? new Date().getUTCFullYear() + '-01-01' : new Date(Date.now() - days[r]! * 86400e3).toISOString().slice(0, 10)
  let pts = (await priceSeries(symbol, from)).map((p) => ({ t: p.d, v: p.close }))
  if (r === '5Y') { const w: typeof pts = []; for (const p of pts) { const wk = Math.floor(Date.parse(p.t) / (7 * 86400e3)); const l = w[w.length - 1]; if (l && Math.floor(Date.parse(l.t) / (7 * 86400e3)) === wk) w[w.length - 1] = p; else w.push(p) } pts = w }
  // The live price as the last point, when it is newer than the last close.
  if (q?.live && pts.length && q.as_of.slice(0, 10) > pts[pts.length - 1]!.t) pts.push({ t: q.as_of.slice(0, 10), v: q.price })
  return { range: r, intraday: false, points: pts, base: pts[0]?.v ?? null }
})
