// The live market strip on the Wealth pages and in the wealth client portal: US stock indices (through the SPY and
// QQQ funds, from Alpaca), Bitcoin and Ether (Alpaca, else Coinbase's public prices), gold (the metals feed Aidi
// Wealth already keeps), the 3-month T-bill (US Treasury's daily bill rates) and the effective Fed funds rate (New York
// Fed). Only public market prices: nothing about any client. Each source is asked at most every few seconds to minutes
// whoever is watching, a source that fails is simply left out, and nothing here comes from Yahoo.
export interface TickItem { key: string; name: string; value: number; unit: 'usd' | 'usd_oz' | 'pct'; change: number | null; change_unit: 'pct' | 'pts'; as_of: string | null; source: string; closed?: boolean }

const memo = new Map<string, { at: number; v: TickItem[] }>()
async function cached(key: string, ttl: number, fn: () => Promise<TickItem[]>): Promise<TickItem[]> {
  const c = memo.get(key); if (c && Date.now() - c.at < ttl) return c.v
  try { const v = await fn(); memo.set(key, { at: Date.now(), v }); return v } catch (e) { console.error('[ticker] ' + key, (e as Error).message); return c?.v ?? [] }
}
const pct = (now: number, prev: number | null | undefined) => (prev ? Math.round(((now - prev) / prev) * 10000) / 100 : null)
const getJson = async <T>(url: string, init?: RequestInit): Promise<T> => { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error(url.split('?')[0] + ' HTTP ' + r.status); return await r.json() as T }

// Alpaca snapshots: the last trade against yesterday's close.
interface Snap { latestTrade?: { p?: number; t?: string }; dailyBar?: { c?: number; t?: string }; prevDailyBar?: { c?: number } }
export function fromSnapshots(snaps: Record<string, Snap | undefined>, names: Record<string, string>, unit: TickItem['unit'], source: string): TickItem[] {
  const out: TickItem[] = []
  for (const [sym, name] of Object.entries(names)) {
    const s = snaps[sym], p = s?.latestTrade?.p ?? s?.dailyBar?.c
    if (!s || !p) continue
    out.push({ key: sym, name, value: p, unit, change: pct(p, s.prevDailyBar?.c), change_unit: 'pct', as_of: s.latestTrade?.t ?? s.dailyBar?.t ?? null, source })
  }
  return out
}
const STOCKS: Record<string, string> = { SPY: 'S&P 500 (SPY)', QQQ: 'Nasdaq 100 (QQQ)' }
const CRYPTO: Record<string, string> = { 'BTC/USD': 'Bitcoin', 'ETH/USD': 'Ether' }
async function stocks(): Promise<TickItem[]> {
  if (!alpacaReady()) return []
  const j = await alpacaData<Record<string, Snap>>('/v2/stocks/snapshots?symbols=' + Object.keys(STOCKS).join(',') + '&feed=iex')
  // Outside US market hours the last trade is the close: the strip says so.
  const open = usMarketOpen(new Date())
  return fromSnapshots(j, STOCKS, 'usd', 'Alpaca').map((x) => ({ ...x, closed: !open }))
}
async function crypto(): Promise<TickItem[]> {
  if (alpacaReady()) {
    try { const j = await alpacaData<{ snapshots?: Record<string, Snap> }>('/v1beta3/crypto/us/snapshots?symbols=' + Object.keys(CRYPTO).map(encodeURIComponent).join(',')); const r = fromSnapshots(j.snapshots ?? {}, CRYPTO, 'usd', 'Alpaca'); if (r.length) return r } catch (e) { console.error('[ticker] alpaca crypto', (e as Error).message) }
  }
  // Coinbase public prices: the last trade against 24 hours ago.
  const out: TickItem[] = []
  for (const [sym, name] of Object.entries(CRYPTO)) {
    const j = await getJson<{ open?: string; last?: string }>('https://api.exchange.coinbase.com/products/' + sym.replace('/', '-') + '/stats', { headers: { accept: 'application/json', 'user-agent': 'AidiOS/1.0' } })
    const last = Number(j.last), open = Number(j.open)
    if (last > 0) out.push({ key: sym, name, value: last, unit: 'usd', change: pct(last, open), change_unit: 'pct', as_of: new Date().toISOString(), source: 'Coinbase' })
  }
  return out
}
async function gold(): Promise<TickItem[]> {
  const g = (await metalPrices()).gold
  return g ? [{ key: 'XAU', name: 'Gold', value: g.price, unit: 'usd_oz', change: g.day_change_pct, change_unit: 'pct', as_of: g.as_of, source: 'gold-api.com' }] : []
}
// US Treasury daily bill rates (CSV): the 13-week coupon-equivalent rate, against the day before.
export function tbillFromCsv(csv: string): TickItem[] {
  const lines = csv.trim().split(/\r?\n/), head = (lines[0] ?? '').split(',').map((h) => h.replace(/"/g, '').trim().toUpperCase())
  const col = head.findIndex((h) => /13 WEEKS COUPON EQUIVALENT/.test(h)), dcol = head.findIndex((h) => h === 'DATE')
  if (col < 0 || dcol < 0) return []
  const rows = lines.slice(1).map((l) => l.split(',').map((c) => c.replace(/"/g, '').trim())).filter((r) => Number.isFinite(parseFloat(r[col] ?? '')))
  const [a, b] = rows, v = a ? parseFloat(a[col]!) : NaN
  if (!a || !Number.isFinite(v)) return []
  const prev = b ? parseFloat(b[col]!) : null
  return [{ key: 'TBILL3M', name: 'T-bill 3M', value: v, unit: 'pct', change: prev === null ? null : Math.round((v - prev) * 100) / 100, change_unit: 'pts', as_of: a[dcol] ?? null, source: 'US Treasury' }]
}
async function tbill(): Promise<TickItem[]> {
  const y = new Date().getUTCFullYear()
  const url = (yr: number) => 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/' + yr + '/all?type=daily_treasury_bill_rates&field_tdr_date_value=' + yr + '&page&_format=csv'
  const r = await fetch(url(y), { signal: AbortSignal.timeout(8000) })
  let out = r.ok ? tbillFromCsv(await r.text()) : []
  // Early January: this year's file may have one row or none yet.
  if (out.length === 0 || out[0]!.change === null) { const r2 = await fetch(url(y - 1), { signal: AbortSignal.timeout(8000) }).catch(() => null); if (r2?.ok && out.length === 0) out = tbillFromCsv(await r2.text()) }
  return out
}
// New York Fed: the effective Fed funds rate, against the previous business day.
export function effrFromJson(j: { refRates?: { effectiveDate?: string; percentRate?: number }[] }): TickItem[] {
  const [a, b] = j.refRates ?? []
  if (!a || typeof a.percentRate !== 'number') return []
  return [{ key: 'EFFR', name: 'Fed funds', value: a.percentRate, unit: 'pct', change: typeof b?.percentRate === 'number' ? Math.round((a.percentRate - b.percentRate) * 100) / 100 : null, change_unit: 'pts', as_of: a.effectiveDate ?? null, source: 'New York Fed' }]
}
async function fedFunds(): Promise<TickItem[]> { return effrFromJson(await getJson('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/2.json')) }

// Regular US market hours, 9:30 to 16:00 New York time on weekdays (holidays aside).
export function usMarketOpen(d: Date): boolean {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]))
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false
  const m = Number(p.hour) % 24 * 60 + Number(p.minute)
  return m >= 9 * 60 + 30 && m < 16 * 60
}

export async function marketTicker(): Promise<{ items: TickItem[]; at: string }> {
  const parts = await Promise.all([cached('stocks', 15_000, stocks), cached('crypto', 15_000, crypto), cached('gold', 60_000, gold), cached('tbill', 3600_000, tbill), cached('effr', 3600_000, fedFunds)])
  return { items: parts.flat(), at: new Date().toISOString() }
}
