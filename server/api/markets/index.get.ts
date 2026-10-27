// Public Markets list: the watchlist, the S&P 100, the ETF list or crypto, with the latest price, the day's move and,
// where one has been worked out, the value, the signal at today's price and the AI's latest headline. Search matches symbol or name.
export default defineEventHandler(async (event) => {
  await requireMarkets(event)
  const q = getQuery(event)
  const u = ['watchlist', 'sp100', 'etf', 'crypto'].includes(String(q.u)) ? String(q.u) : 'watchlist'
  const s = String(q.q ?? '').trim().slice(0, 40)
  const rows = (await db().query<{ symbol: string; name: string; kind: MarketKind; sector: string | null; watch: boolean; fair_value: string | null; re: string | null; data_ok: boolean | null; method: string | null; valued_at: string | null; version: number | null; ai_headline: string | null; ai_stance: string | null; ai_break: boolean | null }>(
    `SELECT i.symbol, i.name, i.kind, i.sector, (w.symbol IS NOT NULL) AS watch, v.fair_value::text, v.result->>'re' AS re, (v.result->>'data_ok')::boolean AS data_ok, v.result->>'method' AS method, v.created_at AS valued_at, v.version, rv.review->>'headline' AS ai_headline, rv.review->>'stance' AS ai_stance, (rv.review->>'thesis_break')::boolean AS ai_break
       FROM markets.instruments i LEFT JOIN markets.watchlist w ON w.symbol = i.symbol
       LEFT JOIN LATERAL (SELECT fair_value, result, created_at, version FROM markets.valuations x WHERE x.symbol = i.symbol ORDER BY version DESC LIMIT 1) v ON true
       LEFT JOIN LATERAL (SELECT review FROM markets.ai_reviews r WHERE r.symbol = i.symbol ORDER BY created_at DESC LIMIT 1) rv ON true
      WHERE ($1 = '' OR i.symbol ILIKE $1 || '%' OR i.name ILIKE '%' || $1 || '%')
        AND ($1 <> '' OR ($2 = 'watchlist' AND w.symbol IS NOT NULL) OR ($2 <> 'watchlist' AND $2 = ANY(i.universe)))
      ORDER BY (w.symbol IS NOT NULL) DESC, i.symbol LIMIT 120`, [s, u])).rows
  const qs = await quoteMany(rows)
  // A month of daily closes for each row's small chart.
  const sp = new Map<string, number[]>()
  for (const x of (await db().query<{ symbol: string; c: string[] }>("SELECT symbol, array_agg(close::text ORDER BY d) AS c FROM markets.prices WHERE symbol = ANY($1) AND d > current_date - 45 GROUP BY symbol", [rows.map((r) => r.symbol)])).rows) sp.set(x.symbol, x.c.map(Number))
  const a = await marketAssumptions()
  const counts = (await db().query<{ watchlist: number }>('SELECT count(*)::int AS watchlist FROM markets.watchlist')).rows[0]!
  return {
    universe: u, counts, mrp_set: a.mrp_us.set, horizon: a.horizon_years.value ?? 3,
    rows: rows.map((r) => {
      const qq = qs.get(r.symbol) ?? null
      const lv = qq && r.fair_value != null && r.re != null ? liveSignal({ fair_value: Number(r.fair_value), result: { re: Number(r.re), data_ok: r.data_ok } } as unknown as MarketValuation, qq.price, a.horizon_years.value ?? 3) : null
      return { symbol: r.symbol, name: r.name, kind: r.kind, sector: r.sector, watch: r.watch, price: qq?.price ?? null, change_pct: qq?.change_pct ?? null, as_of: qq?.as_of ?? null, live: qq?.live ?? false,
        fair_value: r.fair_value == null ? null : Number(r.fair_value), method: r.method, mos: lv?.mos ?? null, signal: lv?.signal ?? null, signal_label: lv?.label ?? null, valued_at: r.valued_at, version: r.version, spark: [...(sp.get(r.symbol) ?? []), ...(qs.get(r.symbol)?.live ? [qs.get(r.symbol)!.price] : [])].slice(-31), ai_headline: r.ai_headline, ai_stance: r.ai_stance, ai_break: !!r.ai_break }
    })
  }
})
