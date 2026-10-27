// Live gold and silver prices (gold-api.com, no key), refreshed every minute and kept as history every 15 minutes; US
// Treasury rates daily from FRED; other rates (Nigerian T-bills, bank CDs…) entered by staff.
// One-off backfill of daily closes (Stooq CSV, free) so the charts show growth over time, not just from today.
async function backfill(symbol: 'XAU' | 'XAG') {
  const days = Number((await asPlatform(() => db().query<{ n: string }>("SELECT count(DISTINCT date_trunc('day', as_of)) AS n FROM wm.market WHERE symbol = $1", [symbol]))).rows[0]?.n ?? 0)
  if (days > 200) return
  // Stooq's daily spot closes (free CSV), five years.
  try {
    const res = await fetch('https://stooq.com/q/d/l/?s=' + symbol.toLowerCase() + 'usd&i=d', { signal: AbortSignal.timeout(10000) }); const csv = await res.text()
    const since = new Date(Date.now() - 5 * 365 * 86400e3).toISOString().slice(0, 10)
    const rows = csv.split(/\r?\n/).slice(1).map((l) => l.split(',')).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[0] ?? '') && Number(c[4]) > 0 && c[0]! >= since)
    if (rows.length < 20) return
    await asPlatform(async () => { for (let i = 0; i < rows.length; i += 400) { const chunk = rows.slice(i, i + 400); await db().query('INSERT INTO wm.market (symbol, price, as_of) SELECT $1, p, (d::date + time \'21:00\')::timestamptz FROM unnest($2::date[], $3::numeric[]) AS t(d, p) WHERE NOT EXISTS (SELECT 1 FROM wm.market m WHERE m.symbol = $1 AND date_trunc(\'day\', m.as_of) = t.d::timestamptz)', [symbol, chunk.map((c) => c[0]), chunk.map((c) => Number(c[4]))]) } })
  } catch (err) { console.error('[market] backfill ' + symbol, (err as Error).message) }
}
// Spot gold and silver: asked of gold-api.com at most once a minute (kept in memory), with a point saved to the history
// every 15 minutes. The day's change is against the last price of the previous day.
const spotMemo = new Map<string, { at: number; price: number; as_of: string }>()
async function spot(s: 'XAU' | 'XAG'): Promise<{ price: number; as_of: string } | null> {
  const c = spotMemo.get(s)
  if (c && Date.now() - c.at < 60e3) return c
  try {
    const res = await fetch('https://api.gold-api.com/price/' + s, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) }); const j = await res.json() as { price?: number }
    if (res.ok && j.price && j.price > 0) {
      const v = { at: Date.now(), price: j.price, as_of: new Date().toISOString() }; spotMemo.set(s, v)
      const last = (await asPlatform(() => db().query<{ as_of: string }>('SELECT max(as_of) AS as_of FROM wm.market WHERE symbol = $1', [s]))).rows[0]?.as_of
      if (!last || Date.now() - new Date(last).getTime() > 15 * 60e3) await asPlatform(() => db().query('INSERT INTO wm.market (symbol, price) VALUES ($1,$2)', [s, j.price]))
      return v
    }
  } catch (err) { console.error('[market] ' + s, (err as Error).message) }
  return c ?? null
}
export async function metalPrices() {
  await Promise.all([backfill('XAU'), backfill('XAG')])
  const series = async (s: string) => (await asPlatform(() => db().query<{ d: string; price: string }>("SELECT to_char(date_trunc('day', as_of), 'YYYY-MM-DD') AS d, (array_agg(price ORDER BY as_of DESC))[1]::text AS price FROM wm.market WHERE symbol = $1 AND as_of > now() - interval '5 years' GROUP BY 1 ORDER BY 1", [s]))).rows.map((r) => ({ d: r.d, price: Number(r.price) }))
  const pack = async (s: 'XAU' | 'XAG') => {
    const [sr, live] = await Promise.all([series(s), spot(s)])
    const lastRow = (await asPlatform(() => db().query<{ price: string; as_of: string }>('SELECT price::text, as_of FROM wm.market WHERE symbol = $1 ORDER BY as_of DESC LIMIT 1', [s]))).rows[0]
    const now = live ?? (lastRow ? { price: Number(lastRow.price), as_of: new Date(lastRow.as_of).toISOString() } : null)
    if (!now) return null
    // The live price is today's point on the chart.
    const today = now.as_of.slice(0, 10)
    const pts = sr.filter((p) => p.d < today).concat([{ d: today, price: now.price }])
    const prevDay = [...sr].reverse().find((p) => p.d < today)?.price ?? null, first = pts[0]?.price
    return { price: now.price, as_of: now.as_of, live: !!live, day_change_pct: prevDay ? Math.round(((now.price - prevDay) / prevDay) * 10000) / 100 : null, since_pct: first ? Math.round(((now.price - first) / first) * 10000) / 100 : null, since: pts[0]?.d ?? null, series: pts }
  }
  return { gold: await pack('XAU'), silver: await pack('XAG') }
}
export async function refreshUsTbills() {
  const last = (await db().query<{ created_at: string }>("SELECT max(created_at) AS created_at FROM wm.rates WHERE country = 'US' AND product = 'US Treasury bills (average)'")).rows[0]?.created_at
  if (last && Date.now() - new Date(last).getTime() < 24 * 3600 * 1000) return
  try {
    const url = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?filter=security_desc:eq:Treasury%20Bills&sort=-record_date&page[size]=24&fields=record_date,avg_interest_rate_amt'
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) }); const j = await res.json() as { data?: { record_date: string; avg_interest_rate_amt: string }[] }
    for (const r of j.data ?? []) await db().query("INSERT INTO wm.rates (country, product, rate, as_of, source) VALUES ('US','US Treasury bills (average)',$1,$2,'US Treasury') ON CONFLICT (organization_id, country, product, as_of) DO UPDATE SET rate = EXCLUDED.rate, created_at = now()", [Number(r.avg_interest_rate_amt), r.record_date])
  } catch (err) { console.error('[rates] treasury', (err as Error).message) }
}
// Interest rates for the charts: US Treasury rates daily from FRED (3-month T-bill and 10-year), the rates staff record
// (Nigerian T-bills, bank CDs…). The monthly average rate on Treasury bills outstanding is still kept for statements,
// but not charted: it trails the market by a month or more.
export async function ratesFor(country: 'US' | 'NG' | null) {
  if (!country || country === 'US') { await refreshUsTbills(); await refreshRates() }
  const rows = (await db().query<{ id: string; country: string; product: string; rate: string; as_of: string; source: string | null }>("SELECT id, country, product, rate::text, to_char(as_of, 'YYYY-MM-DD') AS as_of, source FROM wm.rates WHERE ($1::text IS NULL OR country = $1) AND product <> 'US Treasury bills (average)' AND as_of > current_date - interval '5 years' ORDER BY country, product, as_of", [country])).rows
  const m = new Map<string, { country: string; product: string; source: string | null; points: { as_of: string; rate: number }[] }>()
  if (!country || country === 'US') {
    for (const [series, product] of [['DTB3', 'US 3-month T-bill'], ['DGS10', 'US 10-year Treasury']] as const) {
      const pts = (await db().query<{ d: string; v: string }>("SELECT to_char(d, 'YYYY-MM-DD') AS d, value::text AS v FROM markets.rates WHERE series = $1 AND d > current_date - interval '5 years' ORDER BY d", [series])).rows
      if (pts.length) m.set('US|' + product, { country: 'US', product, source: 'FRED, daily', points: pts.map((p) => ({ as_of: p.d, rate: Number(p.v) })) })
    }
  }
  for (const r of rows) { const k = r.country + '|' + r.product; if (!m.has(k)) m.set(k, { country: r.country, product: r.product, source: r.source, points: [] }); m.get(k)!.points.push({ as_of: r.as_of, rate: Number(r.rate) }) }
  return [...m.values()].map((x) => ({ ...x, latest: x.points[x.points.length - 1] ?? null }))
}
