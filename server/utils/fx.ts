// Exchange rates for reporting only (never for billing). Refreshed at most daily from a free public source.
let refreshing: Promise<void> | null = null
async function refresh(): Promise<void> {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(10000) })
    const j = await r.json() as { result?: string; rates?: Record<string, number> }
    if (j.result !== 'success' || !j.rates) return
    await asPlatform(async () => { for (const [q, v] of Object.entries(j.rates!)) if (/^[A-Z]{3}$/.test(q) && v > 0) await db().query('INSERT INTO fx.rates (quote, per_usd, fetched_at) VALUES ($1,$2,now()) ON CONFLICT (quote) DO UPDATE SET per_usd = EXCLUDED.per_usd, fetched_at = now()', [q, v]) })
  } catch (err) { console.error('[fx] refresh failed', err) }
}
export async function fxRates(): Promise<{ rates: Map<string, number>; asOf: string | null }> {
  const load = async () => (await asPlatform(() => db().query<{ quote: string; per_usd: string; fetched_at: string }>('SELECT quote, per_usd::text, fetched_at FROM fx.rates'))).rows
  let rows = await load()
  const newest = rows.reduce((m, r) => (r.fetched_at > m ? r.fetched_at : m), '')
  if (!newest || Date.now() - new Date(newest).getTime() > 24 * 3600e3 || rows.length < 5) { refreshing ??= refresh().finally(() => { refreshing = null }); await refreshing; rows = await load() }
  return { rates: new Map(rows.map((r) => [r.quote, Number(r.per_usd)])), asOf: rows.reduce((m, r) => (r.fetched_at > m ? r.fetched_at : m), '') || null }
}
// How many units of `to` one unit of `from` is worth (null if a rate is missing).
export async function fxRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1
  const { rates } = await fxRates()
  const a = rates.get(from), b = rates.get(to)
  return a && b ? b / a : null
}
