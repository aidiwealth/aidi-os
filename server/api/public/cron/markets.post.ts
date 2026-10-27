// Every 30 minutes on weekdays while US markets are open, and once after the close: Treasury rates and daily closes
// for every instrument we keep (the S&P 100, the ETF and crypto lists, anything on a watchlist), then each workspace's
// watchlist is valued again where its inputs changed. AI work runs in the same pass: the market risk premium when a
// month has passed, and outside market hours a review of each watchlist symbol that is due (a week old, or a new
// filing), whose drivers are applied unless the team set its own; reviews not reached are picked up next run or when
// someone opens the symbol. Called by the scheduled GitHub Action with the secret.
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret, given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const open = usMarketOpen(new Date())
  await refreshRates(true)
  const all = (await db().query<{ symbol: string }>('SELECT symbol FROM markets.instruments ORDER BY symbol')).rows.map((r) => r.symbol)
  const prices = await refreshPrices(all, true)
  let valued = 0, reviews = 0, premium = false
  const t0 = Date.now()
  const ai = !!useRuntimeConfig().anthropicApiKey
  for (const org of await liveOrgs()) {
    setOrgContext(org.id)
    if (!(await enabledModules()).has('public_markets')) continue
    if (ai) premium = !!(await aiMarketRiskPremium()) || premium
    for (const { symbol } of (await db().query<{ symbol: string }>('SELECT symbol FROM markets.watchlist ORDER BY symbol')).rows) {
      try {
        let i = await marketInstrument(symbol)
        if (!i) continue
        if (!open) { await refreshFacts(i, false, 1); i = (await marketInstrument(symbol)) ?? i }
        const v = await valueSymbol(i, { refresh: false })
        if (v) valued++
        // Reviews outside market hours, started within the first eight minutes of the run (each takes up to a minute).
        if (ai && !open && Date.now() - t0 < 8 * 60e3 && v && (i.kind !== 'stock' || v.result?.re != null) && (await reviewDue(i))) { if (await aiReview(i)) reviews++ }
      } catch (err) { console.error('[markets] ' + symbol, (err as Error).message) }
    }
  }
  setOrgContext(null)
  return { ok: true, market_open: open, symbols: all.length, prices, valued, reviews, premium }
})
