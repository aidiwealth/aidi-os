// Exchange rates for the group view, month by month. For each currency and month, in this order:
//   book       the company's own rate for that month (fx.monthly: an Exchange rates / FX rates tab, or typed in)
//   book_near  its nearest own rate (earlier first): book rates move in steps, so the last one set still applies
//   history    the daily rate recorded during that month (fx.history, kept since this was added)
//   daily      today's daily rate: only when nothing else exists, and the page says so
// Every rate is units of the currency per 1 USD.
export type RateSource = 'book' | 'book_near' | 'history' | 'daily'
export interface RateUse { quote: string; month: string; per_usd: number; source: RateSource; from_month?: string }

export async function rateBook(): Promise<{ perUsd: (quote: string, month: string) => RateUse | null; convert: (from: string, to: string, month: string) => { rate: number; uses: RateUse[] } | null }> {
  const own = (await db().query<{ quote: string; m: string; v: number }>("SELECT quote, to_char(month, 'YYYY-MM') AS m, per_usd::float8 AS v FROM fx.monthly ORDER BY quote, month").catch(() => ({ rows: [] as { quote: string; m: string; v: number }[] }))).rows
  const hist = (await db().query<{ quote: string; m: string; v: number }>("SELECT quote, to_char(month, 'YYYY-MM') AS m, per_usd::float8 AS v FROM fx.history").catch(() => ({ rows: [] as { quote: string; m: string; v: number }[] }))).rows
  const daily = (await fxRates().catch(() => ({ rates: new Map<string, number>() }))).rates
  const book = new Map<string, { m: string; v: number }[]>()
  for (const r of own) (book.get(r.quote) ?? book.set(r.quote, []).get(r.quote)!).push({ m: r.m, v: r.v })
  const hmap = new Map(hist.map((r) => [r.quote + '|' + r.m, r.v]))
  const perUsd = (quote: string, month: string): RateUse | null => {
    if (quote === 'USD') return { quote, month, per_usd: 1, source: 'book' }
    const list = book.get(quote) ?? []
    const exact = list.find((x) => x.m === month)
    if (exact) return { quote, month, per_usd: exact.v, source: 'book' }
    const before = [...list].reverse().find((x) => x.m < month), after = list.find((x) => x.m > month)
    const near = before ?? after
    if (near) return { quote, month, per_usd: near.v, source: 'book_near', from_month: near.m }
    const h = hmap.get(quote + '|' + month)
    if (h) return { quote, month, per_usd: h, source: 'history' }
    const d = daily.get(quote)
    return d ? { quote, month, per_usd: d, source: 'daily' } : null
  }
  const convert = (from: string, to: string, month: string) => {
    if (from === to) return { rate: 1, uses: [] }
    const a = perUsd(from, month), b = perUsd(to, month)
    if (!a || !b) return null
    return { rate: b.per_usd / a.per_usd, uses: [a, b].filter((x) => x.quote !== 'USD') }
  }
  return { perUsd, convert }
}
