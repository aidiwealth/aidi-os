// Public Markets data: instruments, daily prices, company figures from SEC filings, Treasury rates and the
// workspace's assumptions, then the valuation of one symbol saved as a version. Sources: Alpaca market data (prices,
// dividends and splits included; Stooq's free daily files when Alpaca has nothing), SEC EDGAR (company figures), FRED
// (the 10-year Treasury and the 3-month T-bill). Nothing here comes from Yahoo, and nothing here reads any client's data.
// Every fetch is throttled and a failed source is logged and skipped: what is already stored keeps working.
import * as Q from '~/shared/quant'

const rc = () => useRuntimeConfig() as unknown as Record<string, string>
const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10)
const num = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export type MarketKind = 'stock' | 'etf' | 'crypto'
export interface MarketInstrument { symbol: string; name: string; kind: MarketKind; exchange: string | null; sector: string | null; cik: string | null; universe: string[]; info: Record<string, any>; facts_at: string | null }
export const MARKET = 'SPY'
export const normSymbol = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/[/-]USD$/, '').replace(/\s+/g, '').slice(0, 12)
export const symbolOk = (s: string) => /^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(s)

// One fetch at a time per key, and not again within `ms` unless forced.
const done = new Map<string, number>(), running = new Map<string, Promise<unknown>>()
async function once<T>(key: string, ms: number, fn: () => Promise<T>, force = false): Promise<T | null> {
  if (!force && Date.now() - (done.get(key) ?? 0) < ms) return null
  if (running.has(key)) return running.get(key) as Promise<T>
  const p = fn().then((v) => { done.set(key, Date.now()); return v }).catch((e) => { console.error('[markets] ' + key, (e as Error).message); return null }).finally(() => running.delete(key))
  running.set(key, p)
  return p
}
const getText = async (url: string, headers: Record<string, string> = {}, ms = 15000) => { const r = await fetch(url, { headers, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(url.split('?')[0] + ' HTTP ' + r.status); return r.text() }

// ── Instruments ──────────────────────────────────────────────────────────────────────────────────────────────────
export async function marketInstrument(symbol: string): Promise<MarketInstrument | null> {
  return (await db().query<MarketInstrument>("SELECT symbol, name, kind, exchange, sector, cik, universe, info, facts_at FROM markets.instruments WHERE symbol = $1", [symbol])).rows[0] ?? null
}
// SEC's list of listed companies (ticker → CIK and name), kept for a day.
let tickers: { at: number; map: Map<string, { cik: string; name: string }> } | null = null
const secHeaders = () => ({ 'user-agent': rc().secUserAgent || 'The Aidi Group Aidi-OS/1.0 (app.theaidigroup.com)', accept: 'application/json' })
export async function secTickers(): Promise<Map<string, { cik: string; name: string }>> {
  if (tickers && Date.now() - tickers.at < 86400e3) return tickers.map
  const j = JSON.parse(await getText('https://www.sec.gov/files/company_tickers.json', secHeaders())) as Record<string, { cik_str: number; ticker: string; title: string }>
  const map = new Map<string, { cik: string; name: string }>()
  for (const r of Object.values(j)) map.set(r.ticker.toUpperCase().replace(/-/g, '.'), { cik: String(r.cik_str).padStart(10, '0'), name: r.title })
  tickers = { at: Date.now(), map }
  return map
}
// A symbol not seen before: a US-listed company (SEC's list), else whatever Alpaca can trade (US stocks and ETFs).
export async function ensureInstrument(symbol: string): Promise<MarketInstrument | null> {
  const have = await marketInstrument(symbol)
  if (have) return have
  if (!symbolOk(symbol)) return null
  let row: { name: string; kind: MarketKind; cik: string | null; exchange: string | null } | null = null
  try { const t = (await secTickers()).get(symbol); if (t) row = { name: t.name, kind: 'stock', cik: t.cik, exchange: null } } catch (e) { console.error('[markets] sec tickers', (e as Error).message) }
  if (!row && alpacaReady()) {
    try {
      const a = await alpaca<{ symbol: string; name?: string; class?: string; exchange?: string; tradable?: boolean }>('/v1/assets/' + encodeURIComponent(symbol))
      if (a?.symbol && a.class === 'us_equity') row = { name: a.name || symbol, kind: /\b(ETF|Trust|Fund|Shares)\b/i.test(a.name ?? '') ? 'etf' : 'stock', cik: null, exchange: a.exchange ?? null }
    } catch { /* not an Alpaca asset */ }
  }
  if (!row) return null
  await db().query('INSERT INTO markets.instruments (symbol, name, kind, cik, exchange) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (symbol) DO NOTHING', [symbol, row.name.slice(0, 200), row.kind, row.cik, row.exchange])
  return marketInstrument(symbol)
}

// ── Prices ───────────────────────────────────────────────────────────────────────────────────────────────────────
interface Bar { t: string; c: number; v?: number }
async function savePrices(symbol: string, bars: { d: string; c: number; v: number | null }[], source: string) {
  for (let i = 0; i < bars.length; i += 1000) {
    const ch = bars.slice(i, i + 1000)
    await db().query('INSERT INTO markets.prices (symbol, d, close, volume, source) SELECT $1, d, c, v, $5 FROM unnest($2::date[], $3::numeric[], $4::numeric[]) AS t(d, c, v) WHERE c > 0 ON CONFLICT (symbol, d) DO UPDATE SET close = EXCLUDED.close, volume = EXCLUDED.volume, source = EXCLUDED.source',
      [symbol, ch.map((b) => b.d), ch.map((b) => b.c), ch.map((b) => b.v), source])
  }
}
const alpacaSym = (i: { symbol: string; kind: MarketKind }) => (i.kind === 'crypto' ? i.symbol + '/USD' : i.symbol)
// Daily bars from Alpaca for several symbols at once (adjusted for dividends and splits), page by page.
async function alpacaBars(list: { symbol: string; kind: MarketKind }[], start: string): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>()
  if (!alpacaReady() || !list.length) return out
  const crypto = list[0]!.kind === 'crypto'
  const syms = list.map(alpacaSym).join(',')
  // Recent consolidated (SIP) prices need a paid plan; ending 20 minutes ago keeps to what the free plan allows.
  const end = new Date(Date.now() - 20 * 60e3).toISOString()
  const path = (feed: string, tok?: string) => (crypto ? '/v1beta3/crypto/us/bars?' : '/v2/stocks/bars?') + new URLSearchParams({ symbols: syms, timeframe: '1Day', start: start + 'T00:00:00Z', end, limit: '10000', ...(crypto ? {} : { adjustment: 'all', feed }), ...(tok ? { page_token: tok } : {}) }).toString()
  let feed = 'sip', tok: string | undefined, pages = 0
  do {
    let j: { bars?: Record<string, Bar[]>; next_page_token?: string | null }
    try { j = await alpacaData(path(feed, tok)) }
    catch (e) { if (!crypto && feed === 'sip' && !tok) { feed = 'iex'; continue } throw e }
    for (const [k, v] of Object.entries(j.bars ?? {})) { const s = k.replace('/USD', ''); out.set(s, [...(out.get(s) ?? []), ...v]) }
    tok = j.next_page_token ?? undefined
  } while (tok && ++pages < 40)
  return out
}
// Stooq's free daily file, when Alpaca has nothing for a symbol.
async function stooq(i: { symbol: string; kind: MarketKind }, start: string): Promise<{ d: string; c: number; v: number | null }[]> {
  const s = i.kind === 'crypto' ? i.symbol.toLowerCase() + 'usd' : i.symbol.toLowerCase().replace('.', '-') + '.us'
  const csv = await getText('https://stooq.com/q/d/l/?s=' + s + '&i=d', {}, 12000)
  return csv.split(/\r?\n/).slice(1).map((l) => l.split(',')).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[0] ?? '') && Number(c[4]) > 0 && c[0]! >= start).map((c) => ({ d: c[0]!, c: Number(c[4]), v: num(c[5]) }))
}
// Bring daily closes up to date: six years for a symbol seen for the first time, else from a week before the last.
export async function refreshPrices(symbols: string[], force = false): Promise<number> {
  const rows = (await db().query<{ symbol: string; kind: MarketKind; last: string | null }>("SELECT i.symbol, i.kind, to_char(max(p.d), 'YYYY-MM-DD') AS last FROM markets.instruments i LEFT JOIN markets.prices p ON p.symbol = i.symbol WHERE i.symbol = ANY($1) GROUP BY i.symbol, i.kind", [symbols])).rows
  // Not again within an hour (prices are daily).
  const due = rows.filter((r) => force || Date.now() - (done.get('px:' + r.symbol) ?? 0) > 3600e3)
  let n = 0
  const groups = new Map<string, typeof due>()
  for (const r of due) { const start = r.last ? new Date(Date.parse(r.last) - 7 * 86400e3).toISOString().slice(0, 10) : daysAgo(6 * 366); const k = r.kind === 'crypto' ? 'c|' + (r.last ? 'u' : start) : 's|' + (r.last ? 'u' : start); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r) }
  for (const [k, g] of groups) {
    for (let i = 0; i < g.length; i += 50) {
      const ch = g.slice(i, i + 50)
      const start = ch.map((r) => (r.last ? new Date(Date.parse(r.last) - 7 * 86400e3).toISOString().slice(0, 10) : daysAgo(6 * 366))).sort()[0]!
      let got = new Map<string, Bar[]>()
      try { got = await alpacaBars(ch, start) } catch (e) { console.error('[markets] alpaca bars', k, (e as Error).message) }
      for (const r of ch) {
        const bars = (got.get(r.symbol) ?? []).map((b) => ({ d: b.t.slice(0, 10), c: b.c, v: b.v ?? null }))
        try {
          if (bars.length) { await savePrices(r.symbol, bars, 'Alpaca'); n += bars.length }
          else { const s = await stooq(r, start); if (s.length) { await savePrices(r.symbol, s, 'Stooq'); n += s.length } }
          done.set('px:' + r.symbol, Date.now())
        } catch (e) { console.error('[markets] prices ' + r.symbol, (e as Error).message) }
      }
    }
  }
  return n
}
export async function priceSeries(symbol: string, from = daysAgo(6 * 366)): Promise<Q.Px[]> {
  return (await db().query<{ d: string; close: string }>("SELECT to_char(d, 'YYYY-MM-DD') AS d, close::text FROM markets.prices WHERE symbol = $1 AND d >= $2 ORDER BY d", [symbol, from])).rows.map((r) => ({ d: r.d, close: Number(r.close) }))
}
// The latest price: Alpaca's last trade (kept 15 seconds), else the last daily close.
const quotes = new Map<string, { at: number; v: MarketQuote }>()
export interface MarketQuote { price: number; as_of: string; source: string; prev_close: number | null; change_pct: number | null; live: boolean }
export async function quoteOf(i: { symbol: string; kind: MarketKind }): Promise<MarketQuote | null> {
  const c = quotes.get(i.symbol)
  if (c && Date.now() - c.at < 15e3) return c.v
  let q: MarketQuote | null = null
  if (alpacaReady()) {
    try {
      type Snap = { latestTrade?: { p?: number; t?: string }; dailyBar?: { c?: number; t?: string }; prevDailyBar?: { c?: number } }
      const s = i.kind === 'crypto'
        ? ((await alpacaData<{ snapshots?: Record<string, Snap> }>('/v1beta3/crypto/us/snapshots?symbols=' + encodeURIComponent(alpacaSym(i)))).snapshots ?? {})[alpacaSym(i)]
        : (await alpacaData<Record<string, Snap>>('/v2/stocks/snapshots?symbols=' + encodeURIComponent(i.symbol) + '&feed=iex'))[i.symbol]
      const p = s?.latestTrade?.p ?? s?.dailyBar?.c, prev = s?.prevDailyBar?.c ?? null
      if (p) q = { price: p, as_of: s?.latestTrade?.t ?? s?.dailyBar?.t ?? new Date().toISOString(), source: i.kind === 'crypto' ? 'Alpaca' : 'Alpaca IEX', prev_close: prev, change_pct: prev ? ((p - prev) / prev) * 100 : null, live: true }
    } catch (e) { console.error('[markets] quote ' + i.symbol, (e as Error).message) }
  }
  if (!q) {
    const r = (await db().query<{ d: string; close: string; source: string }>("SELECT to_char(d, 'YYYY-MM-DD') AS d, close::text, source FROM markets.prices WHERE symbol = $1 ORDER BY d DESC LIMIT 2", [i.symbol])).rows
    if (r[0]) { const p = Number(r[0].close), prev = r[1] ? Number(r[1].close) : null; q = { price: p, as_of: r[0].d + 'T21:00:00Z', source: r[0].source + ' close', prev_close: prev, change_pct: prev ? ((p - prev) / prev) * 100 : null, live: false } }
  }
  if (q) quotes.set(i.symbol, { at: Date.now(), v: q })
  return q
}

// Latest prices for a list (one Alpaca request for the stocks and ETFs, one for crypto), else the last close.
export async function quoteMany(list: { symbol: string; kind: MarketKind }[]): Promise<Map<string, MarketQuote>> {
  const out = new Map<string, MarketQuote>(), need = list.filter((i) => { const c = quotes.get(i.symbol); if (c && Date.now() - c.at < 15e3) { out.set(i.symbol, c.v); return false } return true })
  type Snap = { latestTrade?: { p?: number; t?: string }; dailyBar?: { c?: number; t?: string }; prevDailyBar?: { c?: number } }
  const put = (sym: string, s: Snap | undefined, src: string) => { const p = s?.latestTrade?.p ?? s?.dailyBar?.c, prev = s?.prevDailyBar?.c ?? null; if (!p) return; const q = { price: p, as_of: s?.latestTrade?.t ?? s?.dailyBar?.t ?? new Date().toISOString(), source: src, prev_close: prev, change_pct: prev ? ((p - prev) / prev) * 100 : null, live: true }; out.set(sym, q); quotes.set(sym, { at: Date.now(), v: q }) }
  if (alpacaReady() && need.length) {
    const st = need.filter((i) => i.kind !== 'crypto'), cr = need.filter((i) => i.kind === 'crypto')
    for (let k = 0; k < st.length; k += 100) { try { const j = await alpacaData<Record<string, Snap>>('/v2/stocks/snapshots?symbols=' + st.slice(k, k + 100).map((i) => encodeURIComponent(i.symbol)).join(',') + '&feed=iex'); for (const i of st.slice(k, k + 100)) put(i.symbol, j[i.symbol], 'Alpaca IEX') } catch (e) { console.error('[markets] snapshots', (e as Error).message) } }
    if (cr.length) { try { const j = await alpacaData<{ snapshots?: Record<string, Snap> }>('/v1beta3/crypto/us/snapshots?symbols=' + cr.map((i) => encodeURIComponent(alpacaSym(i))).join(',')); for (const i of cr) put(i.symbol, j.snapshots?.[alpacaSym(i)], 'Alpaca') } catch (e) { console.error('[markets] crypto snapshots', (e as Error).message) } }
  }
  const rest = need.filter((i) => !out.has(i.symbol)).map((i) => i.symbol)
  if (rest.length) {
    const r = (await db().query<{ symbol: string; d: string; close: string; prev: string | null; source: string }>("SELECT DISTINCT ON (symbol) symbol, to_char(d, 'YYYY-MM-DD') AS d, close::text, (lag(close) OVER (PARTITION BY symbol ORDER BY d))::text AS prev, source FROM markets.prices WHERE symbol = ANY($1) AND d > current_date - 30 ORDER BY symbol, d DESC", [rest])).rows
    for (const x of r) { const p = Number(x.close), prev = x.prev ? Number(x.prev) : null; out.set(x.symbol, { price: p, as_of: x.d + 'T21:00:00Z', source: x.source + ' close', prev_close: prev, change_pct: prev ? ((p - prev) / prev) * 100 : null, live: false }) }
  }
  return out
}

// Intraday prices for the 1D and 1W charts: 5-minute bars for the last trading day, 30-minute bars for the last week
// (Alpaca, kept a minute). Null when Alpaca is not set up; the chart then uses daily closes.
const intra = new Map<string, { at: number; v: { t: string; v: number }[] }>()
export async function intradayPrices(i: { symbol: string; kind: MarketKind }, range: '1D' | '1W'): Promise<{ t: string; v: number }[] | null> {
  if (!alpacaReady()) return null
  const k = i.symbol + range, c = intra.get(k)
  if (c && Date.now() - c.at < 60e3) return c.v
  const start = new Date(Date.now() - (range === '1D' ? 5 : 8) * 86400e3).toISOString()
  const q = new URLSearchParams({ symbols: alpacaSym(i), timeframe: range === '1D' ? '5Min' : '30Min', start, limit: '10000', ...(i.kind === 'crypto' ? {} : { feed: 'iex' }) }).toString()
  try {
    const j = await alpacaData<{ bars?: Record<string, Bar[]> }>((i.kind === 'crypto' ? '/v1beta3/crypto/us/bars?' : '/v2/stocks/bars?') + q)
    let bars = (j.bars?.[alpacaSym(i)] ?? []).map((b) => ({ t: b.t, v: b.c }))
    if (range === '1D' && bars.length) {
      // The last trading day only (New York date), or the last 24 hours for crypto.
      const ny = (t: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t))
      const last = bars[bars.length - 1]!.t
      bars = i.kind === 'crypto' ? bars.filter((b) => Date.parse(b.t) > Date.parse(last) - 86400e3) : bars.filter((b) => ny(b.t) === ny(last))
    } else if (range === '1W') bars = bars.filter((b) => Date.parse(b.t) > Date.now() - 7 * 86400e3)
    intra.set(k, { at: Date.now(), v: bars })
    return bars
  } catch (e) { console.error('[markets] intraday ' + i.symbol, (e as Error).message); return null }
}

// ── Rates (FRED, no key: the public CSV) ─────────────────────────────────────────────────────────────────────────
export function fredCsv(csv: string): { d: string; v: number }[] {
  return csv.trim().split(/\r?\n/).slice(1).map((l) => l.split(',')).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[0] ?? '') && Number.isFinite(parseFloat(c[1] ?? ''))).map((c) => ({ d: c[0]!, v: parseFloat(c[1]!) }))
}
export async function refreshRates(force = false): Promise<void> {
  await once('rates', 6 * 3600e3, async () => {
    for (const s of ['DGS10', 'DTB3'] as const) {
      const last = (await db().query<{ d: string | null }>("SELECT to_char(max(d), 'YYYY-MM-DD') AS d FROM markets.rates WHERE series = $1", [s])).rows[0]?.d
      const from = last ? new Date(Date.parse(last) - 14 * 86400e3).toISOString().slice(0, 10) : '2015-01-01'
      const rows = fredCsv(await getText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + s + '&cosd=' + from, { accept: 'text/csv' }))
      for (let i = 0; i < rows.length; i += 1000) {
        const ch = rows.slice(i, i + 1000)
        await db().query("INSERT INTO markets.rates (series, d, value, source) SELECT $1, d, v, 'FRED' FROM unnest($2::date[], $3::numeric[]) AS t(d, v) ON CONFLICT (series, d) DO UPDATE SET value = EXCLUDED.value", [s, ch.map((r) => r.d), ch.map((r) => r.v)])
      }
    }
  }, force)
}
export async function latestRate(series: 'DGS10' | 'DTB3'): Promise<{ value: number; d: string } | null> {
  const r = (await db().query<{ value: string; d: string }>("SELECT value::text, to_char(d, 'YYYY-MM-DD') AS d FROM markets.rates WHERE series = $1 ORDER BY d DESC LIMIT 1", [series])).rows[0]
  return r ? { value: Number(r.value), d: r.d } : null
}
// The 3-month T-bill rate for each month (the month's average), for the beta regression.
export async function monthlyBillRates(): Promise<Record<string, number>> {
  const r = (await db().query<{ m: string; v: string }>("SELECT to_char(d, 'YYYY-MM') AS m, avg(value)::text AS v FROM markets.rates WHERE series = 'DTB3' GROUP BY 1")).rows
  return Object.fromEntries(r.map((x) => [x.m, Number(x.v)]))
}

// ── Company figures from SEC filings (XBRL company facts) ────────────────────────────────────────────────────────
type Fact = { start?: string; end: string; val: number; fy?: number; fp?: string; form: string; filed: string }
const FLOW: Record<string, string[]> = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueGoodsNet'],
  ebit: ['OperatingIncomeLoss'],
  da: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'Depreciation'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  tax: ['IncomeTaxExpenseBenefit'],
  pretax: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'],
  net_income: ['NetIncomeLoss'],
  interest: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt'],
  dps: ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'],
  eps: ['EarningsPerShareDiluted']
}
const STOCK: Record<string, string[]> = {
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  sti: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'],
  debt_total: ['LongTermDebt'],
  debt_lt: ['LongTermDebtNoncurrent'],
  debt_cur: ['LongTermDebtCurrent'],
  borrowings: ['ShortTermBorrowings', 'CommercialPaper'],
  assets_cur: ['AssetsCurrent'],
  liab_cur: ['LiabilitiesCurrent'],
  equity: ['StockholdersEquity']
}
export interface YearFacts { period_end: string; fy: number; form: string; filed: string; revenue: number | null; ebit: number | null; da: number | null; capex: number | null; tax: number | null; pretax: number | null; net_income: number | null; interest: number | null; dps: number | null; eps: number | null; nwc: number | null }
export interface FilingBalance { end: string; form: string; filed: string; cash: number; debt: number; nwc: number | null; equity: number | null; shares: number | null; shares_end: string | null }
// Yearly figures (10-K, twelve months, restated values win) for the last six years, and the latest balance sheet.
export function factsFrom(j: { facts?: Record<string, Record<string, { units?: Record<string, Fact[]> }>> }): { years: YearFacts[]; balance: FilingBalance | null } {
  const g = j.facts?.['us-gaap'] ?? {}, dei = j.facts?.dei ?? {}
  const units = (c: string, u: string) => g[c]?.units?.[u] ?? []
  const annual = (f: Fact) => /^10-K/.test(f.form) && !!f.start && Math.abs((Date.parse(f.end) - Date.parse(f.start!)) / 86400e3 - 365) <= 25
  const byEnd = new Map<string, Record<string, number> & { _filed?: any }>()
  const meta = new Map<string, { filed: string; form: string; fy: number }>()
  for (const [key, cs] of Object.entries(FLOW)) {
    const unit = key === 'dps' || key === 'eps' ? 'USD/shares' : 'USD'
    for (const c of cs) {
      const best = new Map<string, Fact>()
      for (const f of units(c, unit)) if (annual(f)) { const b = best.get(f.end); if (!b || f.filed > b.filed) best.set(f.end, f) }
      for (const [end, f] of best) {
        const row = byEnd.get(end) ?? {}; if (row[key] === undefined) row[key] = f.val; byEnd.set(end, row)
        const m = meta.get(end); if (!m || f.filed > m.filed) meta.set(end, { filed: f.filed, form: f.form, fy: Number(end.slice(0, 4)) })
      }
    }
  }
  // Point-in-time figures (any filing) by date.
  const inst = new Map<string, Record<string, number>>(), instMeta = new Map<string, { filed: string; form: string }>()
  for (const [key, cs] of Object.entries(STOCK)) for (const c of cs) {
    const best = new Map<string, Fact>()
    for (const f of units(c, 'USD')) if (!f.start && /^10-[KQ]/.test(f.form)) { const b = best.get(f.end); if (!b || f.filed > b.filed) best.set(f.end, f) }
    for (const [end, f] of best) { const row = inst.get(end) ?? {}; if (row[key] === undefined) row[key] = f.val; inst.set(end, row); const m = instMeta.get(end); if (!m || f.filed > m.filed) instMeta.set(end, { filed: f.filed, form: f.form }) }
  }
  const debtOf = (b: Record<string, number>) => (b.debt_total ?? ((b.debt_lt ?? 0) + (b.debt_cur ?? 0))) + (b.borrowings ?? 0)
  const nwcOf = (b: Record<string, number> | undefined) => (b && b.assets_cur != null && b.liab_cur != null ? (b.assets_cur - (b.cash ?? 0) - (b.sti ?? 0)) - (b.liab_cur - (b.debt_cur ?? 0) - (b.borrowings ?? 0)) : null)
  const years = [...byEnd].filter(([, r]) => r.revenue != null || r.ebit != null).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-6).map(([end, r]) => ({
    period_end: end, fy: meta.get(end)!.fy, form: meta.get(end)!.form, filed: meta.get(end)!.filed,
    revenue: r.revenue ?? null, ebit: r.ebit ?? null, da: r.da ?? null, capex: r.capex ?? null, tax: r.tax ?? null, pretax: r.pretax ?? null, net_income: r.net_income ?? null, interest: r.interest ?? null, dps: r.dps ?? null, eps: r.eps ?? null, nwc: nwcOf(inst.get(end)) }))
  const ends = [...inst].filter(([, b]) => b.cash != null).map(([e]) => e).sort()
  const lastEnd = ends[ends.length - 1]
  const sh = Object.values(dei.EntityCommonStockSharesOutstanding?.units ?? {}).flat().sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : a.filed < b.filed ? -1 : 1))
  // Share classes (Alphabet, Berkshire) are reported separately on the same date: added together.
  const lastSh = sh[sh.length - 1], shares = lastSh ? sh.filter((x) => x.end === lastSh.end && x.filed === lastSh.filed).reduce((a, x) => a + x.val, 0) : null
  const b = lastEnd ? inst.get(lastEnd)! : null
  return { years, balance: b && lastEnd ? { end: lastEnd, form: instMeta.get(lastEnd)!.form, filed: instMeta.get(lastEnd)!.filed, cash: (b.cash ?? 0) + (b.sti ?? 0), debt: debtOf(b), nwc: nwcOf(b), equity: b.equity ?? null, shares, shares_end: lastSh?.end ?? null } : null }
}
// Figures for a stock, fetched again when older than `days` (three when a page opens it, one in the daily run), so a
// new 10-Q or 10-K is picked up within a day.
export async function refreshFacts(i: MarketInstrument, force = false, days = 3): Promise<void> {
  if (i.kind !== 'stock') return
  if (!force && i.facts_at && Date.now() - Date.parse(i.facts_at) < days * 86400e3) return
  await once('facts:' + i.symbol, 60e3, async () => {
    let cik = i.cik
    if (!cik) cik = (await secTickers()).get(i.symbol)?.cik ?? null
    if (!cik) { await db().query("UPDATE markets.instruments SET facts_at = now(), info = info || '{\"no_filings\": true}' WHERE symbol = $1", [i.symbol]); return }
    const [facts, sub] = await Promise.all([
      getText('https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik + '.json', secHeaders(), 30000).then((t) => JSON.parse(t)),
      getText('https://data.sec.gov/submissions/CIK' + cik + '.json', secHeaders(), 15000).then((t) => JSON.parse(t) as { name?: string; sic?: string; sicDescription?: string; exchanges?: string[] }).catch(() => null)])
    const f = factsFrom(facts)
    for (const y of f.years) await db().query('INSERT INTO markets.fundamentals (symbol, period_end, fy, form, filed, data) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (symbol, period_end) DO UPDATE SET fy = EXCLUDED.fy, form = EXCLUDED.form, filed = EXCLUDED.filed, data = EXCLUDED.data', [i.symbol, y.period_end, y.fy, y.form, y.filed, JSON.stringify(y)])
    const sic = sub?.sic ? Number(sub.sic) : null
    await db().query("UPDATE markets.instruments SET cik = $2, facts_at = now(), sector = coalesce($3, sector), exchange = coalesce($4, exchange), info = (info - 'no_filings') || $5::jsonb WHERE symbol = $1",
      [i.symbol, cik, sub?.sicDescription ? titleCase(sub.sicDescription) : null, sub?.exchanges?.[0] ?? null, JSON.stringify({ balance: f.balance, sic, sec_name: sub?.name ?? null })])
  }, force)
}
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s,&/(-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(And|Of|The|In|For)\b/g, (w) => w.toLowerCase())
export async function yearFacts(symbol: string): Promise<YearFacts[]> {
  return (await db().query<{ data: YearFacts }>('SELECT data FROM markets.fundamentals WHERE symbol = $1 ORDER BY period_end', [symbol])).rows.map((r) => r.data)
}

// ── Assumptions (per workspace) ──────────────────────────────────────────────────────────────────────────────────
export const MARKET_ASSUMPTIONS = {
  mrp_us: { label: 'Market risk premium (US)', unit: '%', default: null as number | null, min: 0, max: 15, help: 'The extra yearly return investors expect from the stock market over Treasuries. Set by AI each month from market-risk-premia.com (US implied), with Damodaran\'s implied premium as a cross-check; you can override it.' },
  terminal_growth: { label: 'Long-run growth after year 10', unit: '%', default: 2.5 as number | null, min: -2, max: 4, help: 'How fast free cash flow grows for ever after the forecast. Keep it at or below the 10-year Treasury rate.' },
  horizon_years: { label: 'Years for the price to reach value', unit: 'years', default: 3 as number | null, min: 1, max: 10, help: 'Used for the expected return: the price is assumed to move to the value over this many years.' },
  tax_rate: { label: 'Tax rate when a company\'s own is unclear', unit: '%', default: 21 as number | null, min: 0, max: 40, help: 'US federal rate. A company\'s own effective rate from its filings is used when it looks sensible.' },
  prob_bear: { label: 'Bear case weight', unit: '%', default: 25 as number | null, min: 0, max: 100, help: 'How likely the bear case is, for the weighted fair value.' },
  prob_base: { label: 'Base case weight', unit: '%', default: 50 as number | null, min: 0, max: 100, help: 'How likely the base case is.' },
  prob_bull: { label: 'Bull case weight', unit: '%', default: 25 as number | null, min: 0, max: 100, help: 'How likely the bull case is.' }
} as const
export type MarketAssumptionKey = keyof typeof MARKET_ASSUMPTIONS
export interface MarketAssumed { value: number | null; effective_date: string | null; source_url: string | null; set: boolean; set_by: 'person' | 'ai' | null; note: string | null }
export async function marketAssumptions(): Promise<Record<MarketAssumptionKey, MarketAssumed>> {
  const r = (await db().query<{ key: MarketAssumptionKey; value: string; effective_date: string; source_url: string | null; set_by: 'person' | 'ai'; note: string | null }>(
    "SELECT DISTINCT ON (key) key, value::text, to_char(effective_date, 'YYYY-MM-DD') AS effective_date, source_url, set_by, note FROM markets.assumptions WHERE effective_date <= current_date ORDER BY key, effective_date DESC, created_at DESC")).rows
  const out = {} as Record<MarketAssumptionKey, MarketAssumed>
  for (const k of Object.keys(MARKET_ASSUMPTIONS) as MarketAssumptionKey[]) { const x = r.find((y) => y.key === k); out[k] = x ? { value: Number(x.value), effective_date: x.effective_date, source_url: x.source_url, set: true, set_by: x.set_by, note: x.note } : { value: MARKET_ASSUMPTIONS[k].default, effective_date: null, source_url: null, set: false, set_by: null, note: null } }
  return out
}

// ── MarketValuation ────────────────────────────────────────────────────────────────────────────────────────────────────
const FINANCIAL_SIC = (sic: number | null) => sic != null && sic >= 6000 && sic < 6800
export interface MarketValuation { id: string; version: number; kind: 'auto' | 'ai' | 'edit'; created_at: string; created_by: string | null; note: string | null; model_version: string; inputs: Record<string, any>; drivers: (Q.Drivers & { scenarios?: Q.ScenarioSet }) | null; result: Record<string, any>; fair_value: number | null }
export async function valuationVersions(symbol: string) {
  return (await db().query<{ id: string; version: number; kind: string; created_at: string; by: string | null; fair_value: string | null; note: string | null }>(
    "SELECT v.id, v.version, v.kind, v.created_at, pp.full_name AS by, v.fair_value::text, v.note FROM markets.valuations v LEFT JOIN core.users u ON u.id = v.created_by LEFT JOIN core.people pp ON pp.id = u.person_id WHERE v.symbol = $1 ORDER BY v.version DESC LIMIT 50", [symbol])).rows
}
export async function valuationById(symbol: string, id?: string | null): Promise<MarketValuation | null> {
  const r = (await db().query<MarketValuation & { fair_value: string | null }>("SELECT v.id, v.version, v.kind, v.created_at, pp.full_name AS created_by, v.note, v.model_version, v.inputs, v.drivers, v.result, v.fair_value::text AS fair_value FROM markets.valuations v LEFT JOIN core.users u ON u.id = v.created_by LEFT JOIN core.people pp ON pp.id = u.person_id WHERE v.symbol = $1 AND ($2::uuid IS NULL OR v.id = $2::uuid) ORDER BY v.version DESC LIMIT 1", [symbol, id ?? null])).rows[0]
  return r ? { ...r, fair_value: r.fair_value == null ? null : Number(r.fair_value) } : null
}

// Inputs are gathered, the numbers worked out with shared/quant, and the result saved as a new version when anything
// that feeds it changed (a new day's price, a new filing, a changed assumption, drivers set by the AI review or the team).
// Drivers come from, in order: what this call sets; else the last ones the AI or the team set; else the company's history.
export async function valueSymbol(i: MarketInstrument, opts: { userId?: string | null; drivers?: Partial<Q.Drivers> & { scenarios?: Q.ScenarioSet }; by?: 'ai' | 'team'; reviewId?: string; note?: string | null; refresh?: boolean } = {}): Promise<MarketValuation | null> {
  const refresh = opts.refresh !== false
  if (refresh) { await refreshRates(); await refreshPrices([i.symbol, MARKET, ...(i.kind === 'crypto' && i.symbol !== 'BTC' ? ['BTC'] : [])]); await refreshFacts(i) }
  const fresh = (await marketInstrument(i.symbol)) ?? i
  const [px, mkt, bills, dgs10, a, q] = await Promise.all([priceSeries(i.symbol), priceSeries(MARKET), monthlyBillRates(), latestRate('DGS10'), marketAssumptions(), quoteOf(i)])
  if (!q) return null
  const beta = Q.betaOf(px, mkt, bills, 60)
  const betaSlim = beta ? { beta: beta.beta, adjusted: beta.adjusted, alpha: beta.alpha, r2: beta.r2, se: beta.se, ci: beta.ci, n: beta.n, from: beta.from, to: beta.to, flags: beta.flags } : null
  const useBeta = beta ? (beta.flags.length ? beta.adjusted : beta.beta) : null
  const mrp = a.mrp_us.value, rf = dgs10?.value ?? null
  const re = useBeta != null && mrp != null && rf != null ? Q.costOfEquity(rf, useBeta, mrp) : null
  const risk = { vol_30: Q.volatility(px, 30, i.kind === 'crypto' ? 365 : 252), vol_90: Q.volatility(px, 90, i.kind === 'crypto' ? 365 : 252), drawdown_1y: Q.maxDrawdown(px.filter((p) => p.d >= daysAgo(366))), drawdown_5y: Q.maxDrawdown(px.filter((p) => p.d >= daysAgo(5 * 366))) }
  const inputs: Record<string, any> = {
    price: { value: q.price, as_of: q.as_of, source: q.source }, prices: { from: px[0]?.d ?? null, to: px[px.length - 1]?.d ?? null, n: px.length, market: MARKET },
    rf_long: dgs10 ? { value: dgs10.value, d: dgs10.d, source: 'FRED DGS10' } : null, rf_short: 'FRED DTB3, monthly average',
    mrp: { value: mrp, effective_date: a.mrp_us.effective_date, source_url: a.mrp_us.source_url, set: a.mrp_us.set }, beta: betaSlim, beta_used: useBeta,
    assumptions: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.value]))
  }
  const result: Record<string, any> = { re, risk, warnings: [] as string[], beta_points: beta?.points.map((p) => ({ m: p.m, x: Math.round(p.x * 1e6) / 1e6, y: Math.round(p.y * 1e6) / 1e6 })) ?? null }
  const warn = (s: string) => result.warnings.push(s)
  if (!beta) warn('Not enough price history for a beta (needs 36 months).')
  else if (beta.flags.length) warn('The beta is not a tight fit (' + [beta.flags.includes('low_r2') ? 'R² under 0.15' : '', beta.flags.includes('wide_range') ? 'wide range' : ''].filter(Boolean).join(', ') + '), so the adjusted beta ' + beta.adjusted.toFixed(2) + ' is used.')
  if (mrp == null) warn('The market risk premium is not set yet: the AI sets it from its published sources (or an admin or GP can enter it under Assumptions).')
  if (rf == null) warn('The 10-year Treasury rate is not available yet.')
  let drivers: (Q.Drivers & { scenarios?: Q.ScenarioSet }) | null = null
  let fair: number | null = null
  if (i.kind === 'crypto') {
    const btc = i.symbol === 'BTC' ? null : Q.betaOf(px, await priceSeries('BTC'), bills, 36)
    result.crypto = { beta_spy: beta?.beta ?? null, beta_btc: btc?.beta ?? null }
    result.method = 'risk'
  } else if (i.kind === 'etf') {
    result.method = 'etf'
  } else {
    const ys = await yearFacts(i.symbol), bal = (fresh.info?.balance ?? null) as FilingBalance | null, sic = num(fresh.info?.sic)
    const lastY = ys[ys.length - 1]
    inputs.filings = { years: ys.map((y) => ({ fy: y.fy, period_end: y.period_end, form: y.form, filed: y.filed })), balance: bal ? { end: bal.end, form: bal.form, filed: bal.filed } : null, source: 'SEC EDGAR' }
    const stale = !bal || Date.parse(bal.end) < Date.now() - 200 * 86400e3
    const dataOk = !stale && (!q.live ? Date.now() - Date.parse(q.as_of) < 4 * 86400e3 : true)
    result.data_ok = dataOk
    if (stale) warn('The latest balance sheet is more than two quarters old.')
    if (FINANCIAL_SIC(sic)) {
      result.method = 'ddm'
      warn('Banks, insurers and other financial companies are not valued with free cash flow; the dividend model is shown instead.')
      const dps = lastY?.dps ?? null, g = a.terminal_growth.value ?? 2.5
      const v = dps != null && re != null ? Q.ddm(dps, re, g) : null
      result.ddm = v; inputs.dps = dps
    } else if (!lastY?.revenue || lastY.ebit == null || !bal?.shares) {
      result.method = 'none'
      warn('The filings do not have the revenue, operating profit or share count a cash flow model needs.')
    } else if (re != null) {
      result.method = 'dcf'
      const hist: Q.History = {
        revenue: ys.map((y) => y.revenue ?? NaN), ebit: ys.map((y) => y.ebit ?? NaN),
        tax_rate: ys.map((y) => (y.tax != null && y.pretax && y.pretax > 0 ? (y.tax / y.pretax) * 100 : NaN)),
        reinvest: ys.map((y) => (y.capex != null && y.da != null && y.revenue ? ((y.capex - y.da) / y.revenue) * 100 : NaN)),
        nwc: ys.map((y) => (y.nwc != null && y.revenue ? (y.nwc / y.revenue) * 100 : NaN))
      }
      const prev = await valuationById(i.symbol)
      const seeded = Q.seedDrivers(hist, a.terminal_growth.value ?? 2.5, a.tax_rate.value ?? 21)
      const prevBy = prev?.inputs?.drivers_by ?? (prev?.inputs?.drivers_edited ? 'team' : 'history')
      const kept = prev?.drivers && prevBy !== 'history' ? prev.drivers : null
      drivers = { ...seeded, ...(kept ?? {}), ...(opts.drivers ?? {}) } as Q.Drivers & { scenarios?: Q.ScenarioSet }
      // Scenario weights follow the Assumptions page unless the team set their own.
      if (!drivers.scenarios || !(opts.drivers ? opts.by === 'team' : prevBy === 'team')) drivers.scenarios = { ...(drivers.scenarios ?? Q.DEFAULT_SCENARIOS), p: [a.prob_bear.value ?? 25, a.prob_base.value ?? 50, a.prob_bull.value ?? 25] }
      inputs.drivers_by = opts.drivers ? (opts.by ?? 'team') : prevBy
      inputs.drivers_edited = inputs.drivers_by !== 'history'
      if (inputs.drivers_by === 'ai') inputs.ai_review_id = opts.drivers ? opts.reviewId ?? null : prev?.inputs?.ai_review_id ?? null
      inputs.drivers_seed = seeded
      const shares = bal.shares!, debt = Math.max(0, bal.debt), netDebt = debt - bal.cash
      const lastInterest = lastY.interest
      const rd = lastInterest && debt > 0 ? Math.min(rf! + 8, Math.max(rf!, (lastInterest / debt) * 100)) : rf! + 1.5
      const w = Q.wacc({ equity: q.price * shares, debt, re, rd, tax: drivers.tax })
      inputs.capital = { shares, shares_end: bal.shares_end, debt, cash: bal.cash, net_debt: netDebt, rd, rd_how: lastInterest && debt > 0 ? 'interest over debt' : '10-year Treasury + 1.5 points', equity_value: q.price * shares, balance_end: bal.end, revenue: lastY.revenue, ebit: lastY.ebit, fy: lastY.fy }
      const v: Q.Valuer = { base: { revenue: lastY.revenue!, ebit: lastY.ebit!, nwc: bal.nwc }, netDebt, shares, wacc: w, rfLong: rf ?? undefined }
      const d = Q.dcf(v.base, drivers, w, rf ?? undefined)
      result.wacc = w
      if (!d) warn('Long-run growth must be at least 1 point below the WACC (' + w.toFixed(2) + '%).')
      else {
        const sc = Q.scenarios(v, drivers, drivers.scenarios)
        result.dcf = { rows: d.rows, pv_fcf: d.pv_fcf, tv: d.tv, pv_tv: d.pv_tv, ev: d.ev, tv_share: d.tv_share, entry_ev_ebit: d.entry_ev_ebit, entry_ev_sales: d.entry_ev_sales, exit_ev_ebit: d.exit_ev_ebit, exit_ev_sales: d.exit_ev_sales, equity: d.ev - netDebt, per_share: Q.perShare(d.ev, netDebt, shares) }
        for (const x of d.warnings) warn(x)
        result.scenarios = sc
        result.implied_growth = Q.impliedGrowth(v, drivers, q.price)
        result.tornado = Q.tornado(v, drivers, q.price)
        result.history_growth = hist.revenue.length > 1 ? (() => { const r = hist.revenue.filter((x) => x > 0); const n = Math.min(5, r.length - 1); return n > 0 ? ((r[r.length - 1]! / r[r.length - 1 - n]!) ** (1 / n) - 1) * 100 : null })() : null
        if (lastY.dps && lastY.dps > 0) result.ddm = Q.ddm(lastY.dps, re, drivers.terminal_growth)
        fair = sc.weighted ?? sc.base
      }
    }
  }
  result.fair_value = fair
  // Nothing changed since the last version: keep it.
  const prev = await valuationById(i.symbol)
  // Compared with keys in a fixed order (the database keeps JSON keys in its own order).
  const stable = (o: unknown): string => (Array.isArray(o) ? '[' + o.map(stable).join(',') + ']' : o && typeof o === 'object' ? '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stable((o as Record<string, unknown>)[k])).join(',') + '}' : JSON.stringify(o ?? null))
  const sig = (x: Record<string, any> | null | undefined, d: unknown) => stable([x?.price?.as_of?.slice(0, 10), x?.rf_long?.d, x?.mrp, x?.assumptions, x?.filings, x?.beta?.to, d, x?.prices?.to])
  if (prev && !opts.drivers && prev.model_version === Q.MODEL_VERSION && sig(prev.inputs, prev.drivers) === sig(inputs, drivers)) return prev
  const kind = opts.drivers ? (opts.by === 'ai' ? 'ai' : 'edit') : 'auto'
  const ver = ((await db().query<{ v: number | null }>('SELECT max(version) AS v FROM markets.valuations WHERE symbol = $1', [i.symbol])).rows[0]?.v ?? 0) + 1
  // Two people opening the same symbol at once: the second finds the version the first just saved.
  const id = (await db().query<{ id: string }>('INSERT INTO markets.valuations (symbol, version, model_version, kind, inputs, drivers, result, fair_value, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (organization_id, symbol, version) DO NOTHING RETURNING id',
    [i.symbol, ver, Q.MODEL_VERSION, kind, JSON.stringify(inputs), drivers ? JSON.stringify(drivers) : null, JSON.stringify(result), fair, opts.note?.slice(0, 500) || null, opts.userId ?? null])).rows[0]?.id
  if (!id) { if (opts.drivers) throw apiError('busy', 'Someone saved a version at the same moment. Try again.', 409); return valuationById(i.symbol) }
  return valuationById(i.symbol, id)
}
// Margin of safety, expected return and the signal at today's price (worked out when shown, from the stored value).
export function liveSignal(v: MarketValuation | null, price: number, horizon = 3) {
  const fair = v?.fair_value, re = v?.result?.re
  if (fair == null || re == null || !(price > 0) || fair <= 0) return null
  const mos = Q.marginOfSafety(fair, price), er = Q.expectedReturn(fair, price, re, horizon)
  const signal = Q.signalOf(mos, er, re, v!.result.data_ok !== false)
  return { mos, er, signal, label: Q.SIGNAL_LABEL[signal] }
}

// Who may use Public Markets: admins and GPs (or a role an admin added on the Modules page, which the module check
// turns into GP for these APIs), in the Aidi workspace only; never a Finvry company and never someone limited to some
// companies.
export async function requireMarkets(event: Parameters<typeof requireRole>[0]) {
  const user = await requireRole(event, 'admin', 'gp')
  if ((await currentOrg())?.kind === 'company' || String(event.context.entityScope ?? '')) throw apiError('not_found', 'Not found.', 404)
  await requireModule(event, 'public_markets')
  return user
}
