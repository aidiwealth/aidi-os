// Live gold and silver prices (gold-api.com, no key), refreshed at most every 15 minutes and kept as history; US
// Treasury bill average rates (US Treasury Fiscal Data); other rates (Nigerian T-bills, bank CDs…) entered by staff.
export async function metalPrices() {
  const last = (await asPlatform(() => db().query<{ symbol: string; as_of: string }>("SELECT symbol, max(as_of) AS as_of FROM wm.market GROUP BY symbol"))).rows
  const stale = (s: string) => { const r = last.find((x) => x.symbol === s); return !r || Date.now() - new Date(r.as_of).getTime() > 15 * 60 * 1000 }
  for (const s of ['XAU', 'XAG']) if (stale(s)) {
    try { const res = await fetch('https://api.gold-api.com/price/' + s, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) }); const j = await res.json() as { price?: number }; if (res.ok && j.price && j.price > 0) await asPlatform(() => db().query('INSERT INTO wm.market (symbol, price) VALUES ($1,$2)', [s, j.price])) } catch (err) { console.error('[market] ' + s, (err as Error).message) }
  }
  const series = async (s: string) => (await asPlatform(() => db().query<{ d: string; price: string }>("SELECT to_char(date_trunc('day', as_of), 'YYYY-MM-DD') AS d, (array_agg(price ORDER BY as_of DESC))[1]::text AS price FROM wm.market WHERE symbol = $1 AND as_of > now() - interval '365 days' GROUP BY 1 ORDER BY 1", [s]))).rows.map((r) => ({ d: r.d, price: Number(r.price) }))
  const pack = async (s: string) => { const sr = await series(s); const now = (await asPlatform(() => db().query<{ price: string; as_of: string }>('SELECT price::text, as_of FROM wm.market WHERE symbol = $1 ORDER BY as_of DESC LIMIT 1', [s]))).rows[0]; const first = sr[0]?.price; const prevDay = sr.length > 1 ? sr[sr.length - 2]!.price : null
    return now ? { price: Number(now.price), as_of: now.as_of, day_change_pct: prevDay ? Math.round(((Number(now.price) - prevDay) / prevDay) * 10000) / 100 : null, since_pct: first ? Math.round(((Number(now.price) - first) / first) * 10000) / 100 : null, since: sr[0]?.d ?? null, series: sr } : null }
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
export async function ratesFor(country: 'US' | 'NG' | null) {
  if (!country || country === 'US') await refreshUsTbills()
  const rows = (await db().query<{ id: string; country: string; product: string; rate: string; as_of: string; source: string | null }>("SELECT id, country, product, rate::text, to_char(as_of, 'YYYY-MM-DD') AS as_of, source FROM wm.rates WHERE ($1::text IS NULL OR country = $1) AND as_of > current_date - interval '3 years' ORDER BY country, product, as_of", [country])).rows
  const m = new Map<string, { country: string; product: string; source: string | null; points: { as_of: string; rate: number }[] }>()
  for (const r of rows) { const k = r.country + '|' + r.product; if (!m.has(k)) m.set(k, { country: r.country, product: r.product, source: r.source, points: [] }); m.get(k)!.points.push({ as_of: r.as_of, rate: Number(r.rate) }) }
  return [...m.values()].map((x) => ({ ...x, latest: x.points[x.points.length - 1] ?? null }))
}
